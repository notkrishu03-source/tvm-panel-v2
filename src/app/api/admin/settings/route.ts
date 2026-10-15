import { z } from "zod";
import { route } from "@/lib/api";
import { saveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const schema = z.object({
  panelName: z.string().trim().min(2).max(40),
  allowRegistration: z.boolean(),
  defaultMaxVms: z.number().int().min(0).max(1000),
  defaultMaxCpu: z.number().int().min(0).max(512),
  defaultMaxRamMb: z.number().int().min(0).max(4194304),
  defaultMaxDiskGb: z.number().int().min(0).max(100000),
});

export const PUT = route(
  async ({ body }) => {
    await saveSettings(
      Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)])),
    );
    return { ok: true };
  },
  { admin: true, schema },
);
