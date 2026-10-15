import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { vmFiles } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { MAX_FILES_PER_VM, MAX_FILE_BYTES, MAX_TOTAL_BYTES, joinPath } from "@/lib/file-limits";
import { addLog, type ClientVm } from "@/lib/vm";

export { joinPath };

type FileRow = typeof vmFiles.$inferSelect;
type Encoding = "text" | "base64";

export type ClientEntry = {
  id: number;
  name: string;
  type: "file" | "dir";
  sizeBytes: number;
  mimeType: string | null;
  encoding: Encoding;
  updatedAt: string;
};

function toClient(row: FileRow): ClientEntry {
  return {
    id: row.id,
    name: row.name,
    type: row.type as "file" | "dir",
    sizeBytes: row.sizeBytes,
    mimeType: row.mimeType,
    encoding: row.encoding as Encoding,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function normalizePath(raw: string | null | undefined): string {
  const parts = (raw ?? "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (p === "." || p === "..") throw new ApiError(400, "Invalid path");
    if (p.length > 255) throw new ApiError(400, "Path segment is too long");
  }
  return "/" + parts.join("/");
}

export function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") throw new ApiError(400, "Invalid name");
  if (trimmed.length > 255) throw new ApiError(400, "Name is too long");
  if (/[/\0]/.test(trimmed)) throw new ApiError(400, "Name cannot contain / characters");
  return trimmed;
}

function byteLength(content: string, encoding: Encoding) {
  return encoding === "base64" ? Buffer.from(content, "base64").length : Buffer.byteLength(content, "utf8");
}

async function findChild(vmId: number, parentId: number | null, name: string) {
  const [row] = await db
    .select()
    .from(vmFiles)
    .where(
      and(
        eq(vmFiles.vmId, vmId),
        parentId === null ? isNull(vmFiles.parentId) : eq(vmFiles.parentId, parentId),
        eq(vmFiles.name, name),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Resolves an absolute path to its row, or the sentinel `"root"` for "/". */
async function resolvePath(vmId: number, path: string): Promise<FileRow | "root" | null> {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "root";
  let parentId: number | null = null;
  let row: FileRow | null = null;
  for (const part of parts) {
    if (row && row.type !== "dir") return null;
    row = await findChild(vmId, parentId, part);
    if (!row) return null;
    parentId = row.id;
  }
  return row;
}

export async function browse(
  vmId: number,
  path: string,
): Promise<{ kind: "dir"; entries: ClientEntry[] } | { kind: "file"; file: FileRow }> {
  const target = await resolvePath(vmId, path);
  if (target === null) throw new ApiError(404, "Path not found");
  if (target === "root" || target.type === "dir") {
    const parentId = target === "root" ? null : target.id;
    const rows = await db
      .select()
      .from(vmFiles)
      .where(and(eq(vmFiles.vmId, vmId), parentId === null ? isNull(vmFiles.parentId) : eq(vmFiles.parentId, parentId)));
    const entries = rows
      .map(toClient)
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    return { kind: "dir", entries };
  }
  return { kind: "file", file: target };
}

async function assertQuota(vmId: number, addBytes: number, excludeId?: number) {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${vmFiles.sizeBytes}), 0)::int` })
    .from(vmFiles)
    .where(and(eq(vmFiles.vmId, vmId), eq(vmFiles.type, "file")));
  let current = total;
  if (excludeId) {
    const [existing] = await db.select({ s: vmFiles.sizeBytes }).from(vmFiles).where(eq(vmFiles.id, excludeId));
    current -= existing?.s ?? 0;
  }
  if (current + addBytes > MAX_TOTAL_BYTES) {
    throw new ApiError(413, `Storage limit reached (${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB per VM)`);
  }
}

export async function createEntry(
  vm: ClientVm,
  parentPath: string,
  name: string,
  type: "file" | "dir",
  content: string | undefined,
  encoding: Encoding,
  mimeType: string | undefined,
  actor: { id: number },
) {
  const cleanName = validateName(name);
  const parent = await resolvePath(vm.id, parentPath);
  if (parent === null) throw new ApiError(404, "Destination folder not found");
  if (parent !== "root" && parent.type !== "dir") throw new ApiError(400, "Destination is not a folder");
  const parentId = parent === "root" ? null : parent.id;

  if (await findChild(vm.id, parentId, cleanName)) {
    throw new ApiError(409, `"${cleanName}" already exists here`);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vmFiles)
    .where(eq(vmFiles.vmId, vm.id));
  if (count >= MAX_FILES_PER_VM) {
    throw new ApiError(413, `File limit reached (${MAX_FILES_PER_VM} entries per VM)`);
  }

  let sizeBytes = 0;
  if (type === "file") {
    const body = content ?? "";
    sizeBytes = byteLength(body, encoding);
    if (sizeBytes > MAX_FILE_BYTES) {
      throw new ApiError(413, `File is too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`);
    }
    await assertQuota(vm.id, sizeBytes);
  }

  const [row] = await db
    .insert(vmFiles)
    .values({
      vmId: vm.id,
      parentId,
      name: cleanName,
      type,
      content: type === "file" ? content ?? "" : null,
      encoding,
      mimeType: mimeType || null,
      sizeBytes,
    })
    .returning();

  await addLog(vm, actor.id, `${type === "dir" ? "Folder" : "File"} created: ${joinPath(parentPath, cleanName)}`);
  return row;
}

export async function updateEntry(
  vm: ClientVm,
  path: string,
  changes: { newName?: string; content?: string; encoding?: Encoding; mimeType?: string },
  actor: { id: number },
) {
  const row = await resolvePath(vm.id, path);
  if (row === null || row === "root") throw new ApiError(404, "Not found");

  const set: Partial<typeof vmFiles.$inferInsert> = { updatedAt: new Date() };
  const messages: string[] = [];

  if (changes.newName && changes.newName !== row.name) {
    const cleanName = validateName(changes.newName);
    if (await findChild(vm.id, row.parentId, cleanName)) {
      throw new ApiError(409, `"${cleanName}" already exists here`);
    }
    set.name = cleanName;
    messages.push(`renamed to ${cleanName}`);
  }

  if (changes.content !== undefined) {
    if (row.type !== "file") throw new ApiError(400, "Only files can be edited");
    const encoding = changes.encoding ?? (row.encoding as Encoding);
    const sizeBytes = byteLength(changes.content, encoding);
    if (sizeBytes > MAX_FILE_BYTES) {
      throw new ApiError(413, `File is too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`);
    }
    await assertQuota(vm.id, sizeBytes, row.id);
    set.content = changes.content;
    set.encoding = encoding;
    set.sizeBytes = sizeBytes;
    if (changes.mimeType !== undefined) set.mimeType = changes.mimeType;
    messages.push(`content saved (${sizeBytes} bytes)`);
  }

  if (messages.length === 0) return row;

  await db.update(vmFiles).set(set).where(eq(vmFiles.id, row.id));
  await addLog(vm, actor.id, `${row.type === "dir" ? "Folder" : "File"} ${path} ${messages.join(", ")}`);
  return row;
}

export async function deleteEntry(vm: ClientVm, path: string, actor: { id: number }) {
  const row = await resolvePath(vm.id, path);
  if (row === null || row === "root") throw new ApiError(404, "Not found");
  await db.delete(vmFiles).where(eq(vmFiles.id, row.id)); // children cascade via FK
  await addLog(vm, actor.id, `${row.type === "dir" ? "Folder" : "File"} deleted: ${path}`, "warn");
}

/* ------------------------------------------------------------------ */
/* Seed                                                                 */
/* ------------------------------------------------------------------ */

export async function ensureFilesSeed(vm: ClientVm) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vmFiles)
    .where(eq(vmFiles.vmId, vm.id));
  if (count > 0) return;

  const insertDir = async (parentId: number | null, name: string) => {
    const [row] = await db.insert(vmFiles).values({ vmId: vm.id, parentId, name, type: "dir" }).returning();
    return row.id;
  };
  const insertFile = async (parentId: number | null, name: string, content: string) => {
    await db.insert(vmFiles).values({
      vmId: vm.id,
      parentId,
      name,
      type: "file",
      content,
      encoding: "text",
      mimeType: "text/plain",
      sizeBytes: Buffer.byteLength(content, "utf8"),
    });
  };

  const etc = await insertDir(null, "etc");
  const varDir = await insertDir(null, "var");
  const varLog = await insertDir(varDir, "log");
  const root = await insertDir(null, "root");
  await insertDir(null, "home");

  await insertFile(etc, "hostname", `${vm.name}\n`);
  await insertFile(
    etc,
    "os-release",
    `PRETTY_NAME="${vm.osName}"\nNAME="${vm.osName.split(" ")[0]}"\nID=${vm.osName.split(" ")[0].toLowerCase()}\n`,
  );
  await insertFile(
    varLog,
    "syslog",
    `${new Date().toUTCString()} ${vm.name} systemd[1]: Started TuffNode guest agent.\n` +
      `${new Date().toUTCString()} ${vm.name} sshd[612]: Server listening on ${vm.ipv4} port 22.\n`,
  );
  await insertFile(
    root,
    "README.txt",
    `Welcome to ${vm.name}!\nThis VM is managed by TuffNode TVM.\nAssigned address: ${vm.ipv4}\n`,
  );
}
