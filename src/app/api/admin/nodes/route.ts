import { z } from "zod";
import { route } from "@/lib/api";
import { createNode, listNodes } from "@/lib/nodes";

export const dynamic = "force-dynamic";

const hostRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/, "letters, numbers and dashes only"),
  sshHost: z.string().trim().min(2).max(120).regex(hostRegex, "Enter a valid host name or IP"),
  cpu: z.number().int().min(1).max(1024),
  ramGb: z.number().int().min(1).max(8192),
  diskGb: z.number().int().min(10).max(1000000),
  bridge: z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9_.-]+$/, "Invalid bridge name"),
  subnetPrefix: z
    .string()
    .trim()
    .regex(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/, "must look like 10.21.0")
    .refine((v) => v.split(".").every((p) => Number(p) <= 255), "octets must be 0-255"),
});

export const GET = route(async () => {
  return { nodes: await listNodes() };
});

export const POST = route(
  async ({ user, body }) => {
    const node = await createNode(
      {
        name: body.name,
        sshHost: body.sshHost,
        cpu: body.cpu,
        ramMb: body.ramGb * 1024,
        diskGb: body.diskGb,
        bridge: body.bridge,
        subnetPrefix: body.subnetPrefix,
      },
      user,
    );
    return { ok: true, id: node.id };
  },
  { admin: true, schema },
);
