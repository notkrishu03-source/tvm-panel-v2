"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { Button, Card, ConfirmModal, EmptyState, Field, Modal, useToast } from "@/components/ui";
import { useRun } from "@/components/useRun";
import { api } from "@/lib/client-api";
import { joinPath, looksLikeText, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from "@/lib/file-limits";
import { fmtBytes, timeAgo } from "@/lib/format";
import { inputCls } from "@/lib/styles";
import type { TabProps } from "@/components/vm/types";

type Entry = { id: number; name: string; type: "file" | "dir"; sizeBytes: number; mimeType: string | null; encoding: "text" | "base64"; updatedAt: string };
type DirResponse = { type: "dir"; path: string; entries: Entry[] };
type FileResponse = { type: "file"; path: string; name: string; content: string | null; encoding: "text" | "base64"; mimeType: string | null; sizeBytes: number; updatedAt: string };

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function FilesTab({ vm, isAdmin }: TabProps) {
  const toast = useToast();
  const { run, busy } = useRun();
  const locked = vm.suspended && !isAdmin;

  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [newFolder, setNewFolder] = useState(false);
  const [newFile, setNewFile] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [renaming, setRenaming] = useState<Entry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<FileResponse | null>(null);
  const [editContent, setEditContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(
    async (p: string) => {
      setError(null);
      try {
        const res = await api<DirResponse>(`/api/vms/${vm.id}/files?path=${encodeURIComponent(p)}`);
        setEntries(res.entries);
        setPath(res.path);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load folder");
      }
    },
    [vm.id],
  );

  useEffect(() => {
    void load("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm.id]);

  const segments = path.split("/").filter(Boolean);

  async function openEntry(entry: Entry) {
    if (entry.type === "dir") return load(joinPath(path, entry.name));
    try {
      const res = await api<FileResponse>(`/api/vms/${vm.id}/files?path=${encodeURIComponent(joinPath(path, entry.name))}`);
      setEditing(res);
      setEditContent(res.content ?? "");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open file", "error");
    }
  }

  async function submitNewFolder(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await api(`/api/vms/${vm.id}/files`, "POST", { path, name: nameInput, type: "dir" });
      setNewFolder(false);
      setNameInput("");
      toast("Folder created", "success");
      await load(path);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create folder");
    }
  }

  async function submitNewFile(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await api(`/api/vms/${vm.id}/files`, "POST", { path, name: nameInput, type: "file", content: "" });
      setNewFile(false);
      setNameInput("");
      toast("File created", "success");
      await load(path);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create file");
    }
  }

  async function submitRename(e: FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    setFormError(null);
    try {
      await api(`/api/vms/${vm.id}/files`, "PATCH", { path: joinPath(path, renaming.name), newName: renameValue });
      setRenaming(null);
      toast("Renamed", "success");
      await load(path);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not rename");
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const result = await run("save-file", () => api(`/api/vms/${vm.id}/files`, "PATCH", { path: editing.path, content: editContent }), {
      success: "File saved",
      refresh: false,
    });
    if (result) {
      setEditing(null);
      await load(path);
    }
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    let okCount = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        toast(`${file.name} exceeds the ${fmtBytes(MAX_FILE_BYTES)} limit`, "error");
        continue;
      }
      try {
        const asText = looksLikeText(file.name, file.type) && file.size < 2_000_000;
        const content = asText ? await file.text() : await readBase64(file);
        await api(`/api/vms/${vm.id}/files`, "POST", {
          path,
          name: file.name,
          type: "file",
          content,
          encoding: asText ? "text" : "base64",
          mimeType: file.type || undefined,
        });
        okCount++;
      } catch (err) {
        toast(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`, "error");
      }
    }
    setUploading(false);
    if (okCount > 0) toast(`${okCount} file${okCount === 1 ? "" : "s"} uploaded`, "success");
    await load(path);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <button onClick={() => load("/")} className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition hover:bg-white/5 ${path === "/" ? "text-brand-soft" : "text-zinc-400"}`}>
            <Icon name="home" size={14} /> root
          </button>
          {segments.map((seg, i) => {
            const segPath = "/" + segments.slice(0, i + 1).join("/");
            const active = segPath === path;
            return (
              <span key={segPath} className="flex items-center gap-1">
                <span className="text-zinc-700">/</span>
                <button onClick={() => load(segPath)} className={`rounded-md px-2 py-1 transition hover:bg-white/5 ${active ? "text-brand-soft" : "text-zinc-400"}`}>
                  {seg}
                </button>
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={locked} onClick={() => { setFormError(null); setNameInput(""); setNewFolder(true); }}>
            <Icon name="folder" size={14} /> New folder
          </Button>
          <Button size="sm" disabled={locked} onClick={() => { setFormError(null); setNameInput(""); setNewFile(true); }}>
            <Icon name="file" size={14} /> New file
          </Button>
          <input ref={fileInput} type="file" multiple hidden onChange={handleUpload} />
          <Button size="sm" loading={uploading} disabled={locked} onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={14} /> Upload
          </Button>
          <Button size="sm" variant="ghost" onClick={() => load(path)} aria-label="Refresh">
            <Icon name="refresh" size={14} />
          </Button>
        </div>
      </div>

      <p className="text-xs text-zinc-600">
        Text files up to {fmtBytes(MAX_FILE_BYTES)} are editable inline · total storage capped at {fmtBytes(MAX_TOTAL_BYTES)} per VM
      </p>

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {!error && entries === null && <p className="text-sm text-zinc-500">Loading…</p>}

      {!error && entries && entries.length === 0 && <EmptyState title="This folder is empty" description="Create a file or folder, or upload something." />}

      {!error && entries && entries.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Size</th>
                <th className="px-4 py-2.5 font-medium">Modified</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5">
                    <button onClick={() => openEntry(entry)} className="flex items-center gap-2.5 text-left">
                      <Icon name={entry.type === "dir" ? "folder" : "file"} size={16} className={entry.type === "dir" ? "text-brand-soft" : "text-zinc-500"} />
                      <span className="truncate font-medium text-zinc-100">{entry.name}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-zinc-500">{entry.type === "dir" ? "—" : fmtBytes(entry.sizeBytes)}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500">{timeAgo(entry.updatedAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {entry.type === "file" && (
                        <a
                          href={`/api/vms/${vm.id}/files?path=${encodeURIComponent(joinPath(path, entry.name))}&download=1`}
                          download={entry.name}
                          title="Download"
                          className="inline-flex items-center rounded-lg border border-line bg-panel2 px-2 py-1.5 text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                        >
                          <Icon name="download" size={13} />
                        </a>
                      )}
                      <button
                        title="Rename"
                        disabled={locked}
                        onClick={() => { setFormError(null); setRenaming(entry); setRenameValue(entry.name); }}
                        className="inline-flex items-center rounded-lg border border-line bg-panel2 px-2 py-1.5 text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:opacity-40"
                      >
                        <Icon name="pencil" size={13} />
                      </button>
                      <button
                        title="Delete"
                        disabled={locked}
                        onClick={() => setDeleting(entry)}
                        className="inline-flex items-center rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* New folder */}
      <Modal open={newFolder} onClose={() => setNewFolder(false)} title="New folder">
        <form onSubmit={submitNewFolder} className="space-y-4">
          <Field label="Folder name">
            <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} required maxLength={255} autoFocus className={inputCls} />
          </Field>
          {formError && <p className="text-sm text-red-300">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setNewFolder(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Create</Button>
          </div>
        </form>
      </Modal>

      {/* New file */}
      <Modal open={newFile} onClose={() => setNewFile(false)} title="New file">
        <form onSubmit={submitNewFile} className="space-y-4">
          <Field label="File name">
            <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} required maxLength={255} autoFocus placeholder="config.yml" className={inputCls} />
          </Field>
          {formError && <p className="text-sm text-red-300">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setNewFile(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Create</Button>
          </div>
        </form>
      </Modal>

      {/* Rename */}
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title={`Rename ${renaming?.name ?? ""}`}>
        <form onSubmit={submitRename} className="space-y-4">
          <Field label="New name">
            <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} required maxLength={255} autoFocus className={inputCls} />
          </Field>
          {formError && <p className="text-sm text-red-300">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button type="submit" variant="primary">Rename</Button>
          </div>
        </form>
      </Modal>

      {/* Edit / preview file */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.name ?? ""} width="max-w-2xl" footer={
        editing && editing.encoding === "text" ? (
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Close</Button>
            <Button variant="primary" loading={busy === "save-file"} onClick={saveEdit} disabled={locked}>
              <Icon name="check" size={14} /> Save
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setEditing(null)}>Close</Button>
        )
      }>
        {editing && (
          editing.encoding === "text" ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
              disabled={locked}
              className={`h-80 w-full resize-y rounded-lg border border-line bg-bg/80 p-3 font-mono text-xs text-zinc-100 outline-none focus:border-brand/70 ${locked ? "opacity-60" : ""}`}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-10 text-center text-sm text-zinc-400">
              <Icon name="file" size={28} className="text-zinc-600" />
              <p>
                Binary file ({fmtBytes(editing.sizeBytes)}{editing.mimeType ? ` · ${editing.mimeType}` : ""}) — download it to view the contents.
              </p>
              <a
                href={`/api/vms/${vm.id}/files?path=${encodeURIComponent(editing.path)}&download=1`}
                download={editing.name}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-black transition hover:bg-brand-soft"
              >
                <Icon name="download" size={14} /> Download
              </a>
            </div>
          )
        )}
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.type === "dir" ? "folder" : "file"}`}
        confirmLabel="Delete"
        description={
          <>
            <strong>{deleting?.name}</strong>
            {deleting?.type === "dir" ? " and everything inside it will be permanently deleted." : " will be permanently deleted."}
          </>
        }
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/api/vms/${vm.id}/files?path=${encodeURIComponent(joinPath(path, deleting.name))}`, "DELETE");
            toast(`${deleting.name} deleted`, "success");
            setDeleting(null);
            await load(path);
          } catch (e) {
            toast(e instanceof Error ? e.message : "Could not delete", "error");
          }
        }}
      />
    </div>
  );
}
