import { ApiError, route } from "@/lib/api";
import { getNode } from "@/lib/nodes";
import { hostMetrics } from "@/lib/vm";

export const dynamic = "force-dynamic";

export const GET = route(
  async ({ req }) => {
    const nodeIdRaw = new URL(req.url).searchParams.get("nodeId");
    const nodeId = nodeIdRaw ? Number(nodeIdRaw) : null;
    if (nodeId !== null && !Number.isInteger(nodeId)) throw new ApiError(400, "Invalid nodeId");
    if (nodeId !== null && !(await getNode(nodeId))) throw new ApiError(404, "Node not found");
    const withHistory = new URL(req.url).searchParams.get("history") === "1";
    return { metrics: await hostMetrics(nodeId, withHistory) };
  },
  { admin: true },
);
