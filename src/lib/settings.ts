import "server-only";
import { db } from "@/db";
import { settings } from "@/db/schema";

/**
 * Global panel settings. Node-specific values (capacity, bridge, subnet,
 * SSH host) live on the `nodes` table — each node is configured individually.
 */
export type PanelSettings = {
  panelName: string;
  allowRegistration: boolean;
  defaultMaxVms: number;
  defaultMaxCpu: number;
  defaultMaxRamMb: number;
  defaultMaxDiskGb: number;
};

export const SETTING_DEFAULTS: Record<keyof PanelSettings, string> = {
  panelName: "TuffNode TVM",
  allowRegistration: "true",
  defaultMaxVms: "3",
  defaultMaxCpu: "8",
  defaultMaxRamMb: "16384",
  defaultMaxDiskGb: "200",
};

export async function getSettings(): Promise<PanelSettings> {
  const rows = await db.select().from(settings);
  const raw: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) raw[r.key] = r.value;
  const num = (k: keyof PanelSettings) => {
    const n = Number(raw[k]);
    return Number.isFinite(n) ? n : Number(SETTING_DEFAULTS[k]);
  };
  return {
    panelName: raw.panelName,
    allowRegistration: raw.allowRegistration === "true",
    defaultMaxVms: num("defaultMaxVms"),
    defaultMaxCpu: num("defaultMaxCpu"),
    defaultMaxRamMb: num("defaultMaxRamMb"),
    defaultMaxDiskGb: num("defaultMaxDiskGb"),
  };
}

export async function saveSettings(values: Partial<Record<keyof PanelSettings, string>>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }
}
