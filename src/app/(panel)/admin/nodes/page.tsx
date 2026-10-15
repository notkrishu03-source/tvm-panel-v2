import { NodeManager } from "@/components/admin/NodeManager";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { listNodes } from "@/lib/nodes";

export const dynamic = "force-dynamic";

export default async function AdminNodesPage() {
  await requireAdmin();
  const nodeList = await listNodes();
  const online = nodeList.filter((n) => n.status === "online").length;

  return (
    <>
      <PageHeader
        title="Nodes"
        subtitle={`${nodeList.length} node${nodeList.length === 1 ? "" : "s"} · ${online} online · add hardware to expand capacity`}
      />
      <NodeManager nodes={nodeList} />
    </>
  );
}
