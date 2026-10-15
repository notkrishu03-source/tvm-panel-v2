import { z } from "zod";
import { ApiError, parseId, route } from "@/lib/api";
import { browse, createEntry, deleteEntry, ensureFilesSeed, normalizePath, updateEntry } from "@/lib/files";
import { getAccessibleVm } from "@/lib/vm";

export const dynamic = "force-dynamic";

function assertMutable(vm: { suspended: boolean }, isAdmin: boolean) {
  if (vm.suspended && !isAdmin) throw new ApiError(403, "VM is suspended");
}

export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const vm = await getAccessibleVm(parseId(params.id), user);
  await ensureFilesSeed(vm);

  const url = new URL(req.url);
  const path = normalizePath(url.searchParams.get("path"));
  const download = url.searchParams.get("download") === "1";

  const result = await browse(vm.id, path);
  if (result.kind === "file") {
    const file = result.file;
    if (download) {
      const buf =
        file.encoding === "base64" ? Buffer.from(file.content ?? "", "base64") : Buffer.from(file.content ?? "", "utf8");
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
          "Content-Length": String(buf.length),
        },
      });
    }
    return {
      type: "file" as const,
      path,
      name: file.name,
      content: file.content,
      encoding: file.encoding,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      updatedAt: file.updatedAt.toISOString(),
    };
  }

  if (download) throw new ApiError(400, "Cannot download a folder");
  return { type: "dir" as const, path, entries: result.entries };
});

const createSchema = z.object({
  path: z.string().max(4000).optional(),
  name: z.string().min(1).max(255),
  type: z.enum(["file", "dir"]),
  content: z.string().max(8_000_000).optional(),
  encoding: z.enum(["text", "base64"]).optional(),
  mimeType: z.string().max(120).optional(),
});

export const POST = route<{ id: string }, typeof createSchema>(
  async ({ user, params, body }) => {
    const vm = await getAccessibleVm(parseId(params.id), user);
    assertMutable(vm, user.role === "admin");
    await ensureFilesSeed(vm);
    const parentPath = normalizePath(body.path);
    const row = await createEntry(vm, parentPath, body.name, body.type, body.content, body.encoding ?? "text", body.mimeType, user);
    return { ok: true, id: row.id };
  },
  { schema: createSchema },
);

const patchSchema = z.object({
  path: z.string().min(1).max(4000),
  newName: z.string().min(1).max(255).optional(),
  content: z.string().max(8_000_000).optional(),
  encoding: z.enum(["text", "base64"]).optional(),
  mimeType: z.string().max(120).optional(),
});

export const PATCH = route<{ id: string }, typeof patchSchema>(
  async ({ user, params, body }) => {
    const vm = await getAccessibleVm(parseId(params.id), user);
    assertMutable(vm, user.role === "admin");
    const path = normalizePath(body.path);
    await updateEntry(vm, path, { newName: body.newName, content: body.content, encoding: body.encoding, mimeType: body.mimeType }, user);
    return { ok: true };
  },
  { schema: patchSchema },
);

export const DELETE = route<{ id: string }>(async ({ req, user, params }) => {
  const vm = await getAccessibleVm(parseId(params.id), user);
  assertMutable(vm, user.role === "admin");
  const url = new URL(req.url);
  const path = normalizePath(url.searchParams.get("path"));
  if (path === "/") throw new ApiError(400, "Cannot delete the root folder");
  await deleteEntry(vm, path, user);
  return { ok: true };
});
