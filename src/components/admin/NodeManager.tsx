"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Badge, Button, ConfirmModal, Field, Modal, Toggle } from "@/components/ui";
import { useRun } from "@/components/useRun";
import { api } from "@/lib/client-api";
import { fmtMb } from "@/lib/format";
import { inputCls } from "@/lib/styles";
import type { ClientNode } from "@/lib/nodes";

type NodeForm = {
  name: string;
  sshHost: string;
  cpu: number;
  ramGb: number;
  diskGb: number;
  bridge: string;
  subnetPrefix: string;
};

export function NodeManager({ nodes }: { nodes: ClientNode[] }) {
  const { run, busy } = useRun();
  const [editing, setEditing] = useState<ClientNode | "new" | null>(null);
  const [deleting, setDeleting] = useState<ClientNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NodeForm>({
    name: "",
    sshHost: "",
    cpu: 16,
    ramGb: 64,
    diskGb: 1000,
    bridge: "br0",
    subnetPrefix: "10.21.0",
  });
  const set = <K extends keyof NodeForm>(k: K, v: NodeForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setForm({ name: "", sshHost: "", cpu: 16, ramGb: 64, diskGb: 1000, bridge: "br0", subnetPrefix: "10.21.0" });
    setError(null);
    setEditing("new");
  };
  const openEdit = (n: ClientNode) => {
    setForm({
      name: n.name,
      sshHost: n.sshHost,
      cpu: n.cpu,
      ramGb: Math.round(n.ramMb / 1024),
      diskGb: n.diskGb,
      bridge: n.bridge,
      subnetPrefix: n.subnetPrefix,
    });
    setError(null);
    setEditing(n);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing === "new") {
        await api("/api/admin/nodes", "POST", form);
      } else if (editing) {
        await api(`/api/admin/nodes/${editing.id}`, "PATCH", form);
      }
      setEditing(null);
      await run("noop", async () => undefined, { success: editing === "new" ? "Node added" : "Node updated" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  const toggleStatus = (n: ClientNode) =>
    run(`st${n.id}`, () => api(`/api/admin/nodes/${n.id}`, "PATCH", { status: n.status === "online" ? "offline" : "online" }), {
      success: n.status === "online" ? `${n.name} set to offline` : `${n.name} back online`,
    });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={openNew}>
          <Icon name="plus" size={16} /> Add node
        </Button>
      </div>

      {nodes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-zinc-500">
          No nodes yet — add your first KVM node to start deploying VMs.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel/90">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Node</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">CPU</th>
                <th className="px-4 py-3 font-medium">Memory</th>
                <th className="px-4 py-3 font-medium">Storage</th>
                <th className="px-4 py-3 font-medium">VMs</th>
                <th className="px-4 py-3 font-medium">Network</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {nodes.map((n) => (
                <tr key={n.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/nodes/${n.id}`} className="block font-medium text-white hover:text-brand-soft">
                      {n.name}
                    </Link>
                    <span className="block font-mono text-xs text-zinc-500">{n.sshHost}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {n.status === "online" ? <Badge tone="green">Online</Badge> : <Badge tone="red">Offline</Badge>}
                      <Toggle checked={n.status === "online"} disabled={busy === `st${n.id}`} onChange={() => toggleStatus(n)} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-zinc-300">
                    {n.usedCpu} / {n.cpu * 2} <span className="text-zinc-600">({n.cpu}×2)</span>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-zinc-300">
                    {fmtMb(n.usedRamMb)} / {fmtMb(n.ramMb)}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-zinc-300">
                    {n.usedDiskGb} / {n.diskGb} GB
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-zinc-300">
                    {n.vmCount} <span className="text-zinc-600">({n.runningCount} running)</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {n.bridge} · {n.subnetPrefix}.0/24
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Link
                        href={`/admin/nodes/${n.id}`}
                        className="inline-flex items-center rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600"
                      >
                        Details
                      </Link>
                      <Button size="sm" onClick={() => openEdit(n)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={n.vmCount > 0}
                        title={n.vmCount > 0 ? "Node still hosts VMs" : "Delete node"}
                        onClick={() => setDeleting(n)}
                      >
                        <Icon name="trash" size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add node" : `Edit ${editing?.name ?? ""}`} width="max-w-xl">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Node name">
              <input value={form.name} onChange={(e) => set("name", e.target.value)} required minLength={2} maxLength={40} placeholder="tvm-node-02" className={inputCls} disabled={editing !== "new"} />
            </Field>
            <Field label="SSH host" hint="Users connect as root@host -p port">
              <input value={form.sshHost} onChange={(e) => set("sshHost", e.target.value)} required placeholder="ssh.node2.rayvexcloud.in" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="CPU threads">
              <input type="number" min={1} max={1024} value={form.cpu} onChange={(e) => set("cpu", Number(e.target.value))} required className={inputCls} />
            </Field>
            <Field label="Memory (GB)">
              <input type="number" min={1} max={8192} value={form.ramGb} onChange={(e) => set("ramGb", Number(e.target.value))} required className={inputCls} />
            </Field>
            <Field label="Storage (GB)">
              <input type="number" min={10} max={1000000} value={form.diskGb} onChange={(e) => set("diskGb", Number(e.target.value))} required className={inputCls} />
            </Field>
            <Field label="Bridge interface">
              <input value={form.bridge} onChange={(e) => set("bridge", e.target.value)} required maxLength={32} className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Subnet prefix (/24)" hint="IP pool for this node's VMs">
              <input value={form.subnetPrefix} onChange={(e) => set("subnetPrefix", e.target.value)} required placeholder="10.21.0" className={`${inputCls} font-mono`} />
            </Field>
          </div>
          {error && (
            <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy === "noop"}>
              {editing === "new" ? "Add node" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete node"
        confirmLabel="Delete node"
        description={
          <>
            <strong>{deleting?.name}</strong> will be removed from the panel. Only empty nodes can be deleted.
          </>
        }
        onConfirm={async () => {
          if (!deleting) return;
          await run("del", () => api(`/api/admin/nodes/${deleting.id}`, "DELETE"), { success: "Node removed" });
          setDeleting(null);
        }}
      />
    </>
  );
}
