import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { vms } from "@/db/schema";
import { NodeLiveCharts } from "@/components/NodeLiveCharts";
import { osFamilyOf, OsIcon } from "@/components/OsIcon";
import { Icon } from "@/components/Icon";
import { Badge, Card, CardHeader, CopyButton, PageHeader, ProgressBar, Stat, StatusBadge } from "@/components/ui";
import { fmtMb, fmtUptime } from "@/lib/format";
import { getNode } from "@/lib/nodes";
import { getAllocation, listVms, sampleAt } from "@/lib/vm";

export const dynamic = "force-dynamic";

export default async function NodeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nodeId = Number(id);
  if (!Number.isInteger(nodeId) || nodeId <= 0) notFound();

  const node = await getNode(nodeId);
  if (!node) notFound();

  const [alloc, list] = await Promise.all([getAllocation(undefined, nodeId), listVms(eq(vms.nodeId, nodeId))]);
  const now = Date.now();
  const nodeUpSec = 21 * 86400 + (node.id * 7919) % 86400 + Math.floor(now / 60000);
  const running = list.filter((v) => v.status === "running").length;
  const offline = node.status !== "online";

  return (
    <>
      <Link href="/admin/nodes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-200">
        <Icon name="back" size={15} /> All nodes
      </Link>

      <PageHeader
        title={node.name}
        subtitle={`KVM node · ${node.sshHost} · bridge ${node.bridge} · ${node.subnetPrefix}.0/24`}
        actions={offline ? <Badge tone="red">Offline</Badge> : (
          <Badge tone="green">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Online
          </Badge>
        )}
      />

      {offline && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          This node is marked offline — new VMs cannot be placed here and power actions on its VMs are blocked.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Uptime" value={offline ? "—" : fmtUptime(nodeUpSec)} hint={offline ? "node unreachable" : "since last reboot"} />
        <Stat label="CPU threads" value={node.cpu} hint={`${alloc.cpu} vCPUs allocated (2× overcommit)`} />
        <Stat label="Memory" value={`${node.ramMb / 1024} GB`} hint={`${fmtMb(alloc.ramMb)} allocated to VMs`} />
        <Stat label="Storage" value={`${node.diskGb} GB`} hint={`${alloc.diskGb} GB allocated to VMs`} />
      </div>

      <div className="mb-6">
        <NodeLiveCharts nodeId={node.id} hostRamGb={node.ramMb / 1024} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Capacity allocation" subtitle="Resources assigned to VMs on this node" />
          <div className="space-y-5 p-5">
            <ProgressBar label="vCPU (overcommit ×2)" value={alloc.cpu} max={node.cpu * 2} detail={`${alloc.cpu} / ${node.cpu * 2}`} />
            <ProgressBar label="Memory" value={alloc.ramMb} max={node.ramMb} detail={`${fmtMb(alloc.ramMb)} / ${fmtMb(node.ramMb)}`} />
            <ProgressBar label="Storage" value={alloc.diskGb} max={node.diskGb} detail={`${alloc.diskGb} / ${node.diskGb} GB`} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Network" subtitle="This node's network configuration" />
          <dl className="divide-y divide-line text-sm">
            {[
              ["SSH host", node.sshHost],
              ["Bridge interface", node.bridge],
              ["Subnet", `${node.subnetPrefix}.0/24`],
              ["Gateway", `${node.subnetPrefix}.1`],
              ["IP pool", `${alloc.vms} / 240 used (${node.subnetPrefix}.10–.249)`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-5 py-3">
                <dt className="text-zinc-500">{k}</dt>
                <dd className="flex items-center gap-2 font-mono text-zinc-100">
                  {v}
                  {k === "SSH host" && <CopyButton value={node.sshHost} />}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card>
        <CardHeader title="Virtual machines on this node" subtitle={`${list.length} VM${list.length === 1 ? "" : "s"} · ${running} running`} />
        {list.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">No virtual machines on this node yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">VM</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Resources</th>
                  <th className="px-4 py-2.5 font-medium">CPU now</th>
                  <th className="px-4 py-2.5 font-medium">RAM now</th>
                  <th className="px-4 py-2.5 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((vm) => {
                  const cur = vm.status === "running" && !offline ? sampleAt(vm, now) : null;
                  return (
                    <tr key={vm.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5">
                        <Link href={`/vms/${vm.id}`} className="flex items-center gap-2.5">
                          <OsIcon family={osFamilyOf(vm.osName)} size={28} />
                          <span className="font-medium text-white hover:text-brand-soft">{vm.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-300">{vm.ownerName}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={vm.status} suspended={vm.suspended} />
                      </td>
                      <td className="px-4 py-2.5 text-xs tabular-nums text-zinc-400">
                        {vm.cpuCores} vCPU · {fmtMb(vm.ramMb)} · {vm.diskGb} GB
                      </td>
                      <td className="px-4 py-2.5 text-xs tabular-nums text-zinc-300">{cur ? `${cur.cpu.toFixed(1)}%` : "—"}</td>
                      <td className="px-4 py-2.5 text-xs tabular-nums text-zinc-300">{cur ? fmtMb(cur.memUsedMb) : "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-zinc-400">{vm.ipv4}</span>
                        <CopyButton value={vm.ipv4} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
