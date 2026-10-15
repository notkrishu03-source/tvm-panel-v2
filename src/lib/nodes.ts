import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { nodes, vms } from "@/db/schema";
import { ApiError } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";
import { addLog } from "@/lib/vm";

export type NodeRow = typeof nodes.$inferSelect;

export type ClientNode = {
  id: number;
  name: string;
  sshHost: string;
  status: "online" | "offline";
  cpu: number;
  ramMb: number;
  diskGb: number;
  bridge: string;
  subnetPrefix: string;
  createdAt: string;
  vmCount: number;
  runningCount: number;
  usedCpu: number;
  usedRamMb: number;
  usedDiskGb: number;
};

export async function listNodes(): Promise<ClientNode[]> {
  const [rows, alloc] = await Promise.all([
    db.select().from(nodes).orderBy(asc(nodes.id)),
    db
      .select({
        nodeId: vms.nodeId,
        vmCount: sql<number>`count(*)::int`,
        running: sql<number>`count(*) filter (where ${vms.status} = 'running')::int`,
        cpu: sql<number>`coalesce(sum(${vms.cpuCores}), 0)::int`,
        ramMb: sql<number>`coalesce(sum(${vms.ramMb}), 0)::int`,
        diskGb: sql<number>`coalesce(sum(${vms.diskGb}), 0)::int`,
      })
      .from(vms)
      .groupBy(vms.nodeId),
  ]);
  const map = new Map(alloc.map((a) => [a.nodeId, a]));
  return rows.map((n) => {
    const a = map.get(n.id);
    return {
      id: n.id,
      name: n.name,
      sshHost: n.sshHost,
      status: n.status === "online" ? "online" : "offline",
      cpu: n.cpu,
      ramMb: n.ramMb,
      diskGb: n.diskGb,
      bridge: n.bridge,
      subnetPrefix: n.subnetPrefix,
      createdAt: n.createdAt.toISOString(),
      vmCount: a?.vmCount ?? 0,
      runningCount: a?.running ?? 0,
      usedCpu: a?.cpu ?? 0,
      usedRamMb: a?.ramMb ?? 0,
      usedDiskGb: a?.diskGb ?? 0,
    };
  });
}

export async function getNode(id: number): Promise<NodeRow | null> {
  const [row] = await db.select().from(nodes).where(eq(nodes.id, id)).limit(1);
  return row ?? null;
}

export type NodeInput = {
  name: string;
  sshHost: string;
  cpu: number;
  ramMb: number;
  diskGb: number;
  bridge: string;
  subnetPrefix: string;
};

export async function createNode(input: NodeInput, actor: SessionUser) {
  const [existing] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(eq(nodes.name, input.name.toLowerCase()))
    .limit(1);
  if (existing) throw new ApiError(409, `A node named "${input.name}" already exists`);

  const [node] = await db
    .insert(nodes)
    .values({
      name: input.name.toLowerCase(),
      sshHost: input.sshHost,
      cpu: input.cpu,
      ramMb: input.ramMb,
      diskGb: input.diskGb,
      bridge: input.bridge,
      subnetPrefix: input.subnetPrefix,
    })
    .returning();

  await addLog({ id: null, name: node.name }, actor.id, `Node added: ${node.name} (${node.cpu} threads, ${node.ramMb} MB, ${node.diskGb} GB, ${node.subnetPrefix}.0/24)`);
  return node;
}

export async function updateNode(
  id: number,
  changes: Partial<{
    name: string;
    sshHost: string;
    status: "online" | "offline";
    cpu: number;
    ramMb: number;
    diskGb: number;
    bridge: string;
    subnetPrefix: string;
  }>,
  actor: SessionUser,
) {
  const [target] = await db.select().from(nodes).where(eq(nodes.id, id)).limit(1);
  if (!target) throw new ApiError(404, "Node not found");

  const values: Partial<typeof nodes.$inferInsert> = { ...changes };
  if (changes.name) values.name = changes.name.toLowerCase();
  await db.update(nodes).set(values).where(eq(nodes.id, id));

  if (changes.status && changes.status !== target.status) {
    await addLog(
      { id: null, name: target.name },
      actor.id,
      changes.status === "offline"
        ? `Node ${target.name} marked OFFLINE — new VMs blocked, power actions disabled`
        : `Node ${target.name} is back ONLINE`,
      changes.status === "offline" ? "warn" : "info",
    );
  } else {
    await addLog({ id: null, name: target.name }, actor.id, `Node ${target.name} updated`);
  }
}

export async function deleteNode(id: number, actor: SessionUser) {
  const [target] = await db.select().from(nodes).where(eq(nodes.id, id)).limit(1);
  if (!target) throw new ApiError(404, "Node not found");
  const [{ value: vmCount }] = await db.select({ value: count() }).from(vms).where(eq(vms.nodeId, id));
  if (vmCount > 0) {
    throw new ApiError(409, `This node still hosts ${vmCount} VM${vmCount === 1 ? "" : "s"} — migrate or delete them first`);
  }
  await db.delete(nodes).where(eq(nodes.id, id));
  await addLog({ id: null, name: target.name }, actor.id, `Node removed: ${target.name}`, "warn");
}
