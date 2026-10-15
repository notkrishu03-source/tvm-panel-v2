import { z } from "zod";
import { route } from "@/lib/api";
import { deleteNode, getNode, updateNode } from "@/lib/nodes";

export const dynamic = "force-dynamic";

const hostRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

const schema = z.object({
  name: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/, "letters, numbers and dashes only").optional(),
  sshHost: z.string().trim().min(2).max(120).regex(hostRegex, "Enter a valid host name or IP").optional(),
  status: z.enum(["online", "offline"]).optional(),
  cpu: z.number().int().min(1).max(1024).optional(),
  ramGb: z.number().int().min(1).max(8192).optional(),
  diskGb: z.number().int().min(10).max(1000000).optional(),
  bridge: z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9_.-]+$/).optional(),
  subnetPrefix: z
    .string()
    .trim()
    .regex(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    .refine((v) => v.split(".").every((p) => Number(p) <= 255), "octets must be 0-255")
    .optional(),
});

export const PATCH = route<{ id: string }, typeof schema>(
  async ({ user, params, body }) => {
    const id = Number(params.id);
    await updateNode(
      id,
      {
        name: body.name,
        sshHost: body.sshHost,
        status: body.status,
        cpu: body.cpu,
        ramMb: body.ramGb !== undefined ? body.ramGb * 1024 : undefined,
        diskGb: body.diskGb,
        bridge: body.bridge,
        subnetPrefix: body.subnetPrefix,
      },
      user,
    );
    return { ok: true };
  },
  { admin: true, schema },
);

export const DELETE = route<{ id: string }>(
  async ({ user, params }) => {
    await deleteNode(Number(params.id), user);
    return { ok: true };
  },
  { admin: true },
);
