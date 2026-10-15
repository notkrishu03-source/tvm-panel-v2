import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes as nodesTable, users } from "@/db/schema";
import { AdminVmTable } from "@/components/admin/AdminVmTable";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getEnabledTemplates } from "@/lib/data";
import { listVms } from "@/lib/vm";

export const dynamic = "force-dynamic";

export default async function AdminVmsPage() {
  const admin = await requireAdmin();
  const [vms, templates, owners, onlineNodes] = await Promise.all([
    listVms(),
    getEnabledTemplates(),
    db.select({ id: users.id, username: users.username }).from(users).orderBy(asc(users.username)),
    db.select().from(nodesTable).where(eq(nodesTable.status, "online")).orderBy(asc(nodesTable.id)),
  ]);
  const busy = vms.some((v) => ["starting", "stopping", "installing"].includes(v.status));

  return (
    <>
      <AutoRefresh active={busy} />
      <PageHeader title="All virtual machines" subtitle={`${vms.length} VM${vms.length === 1 ? "" : "s"} across ${owners.length} accounts`} />
      <AdminVmTable
        vms={vms}
        templates={templates}
        owners={owners}
        nodes={onlineNodes.map((n) => ({ id: n.id, name: n.name }))}
        adminId={admin.id}
      />
    </>
  );
}
