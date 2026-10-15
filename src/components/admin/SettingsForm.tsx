"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, CardHeader, Field, Toggle } from "@/components/ui";
import { useRun } from "@/components/useRun";
import { api } from "@/lib/client-api";
import { inputCls } from "@/lib/styles";
import type { PanelSettings } from "@/lib/settings";

export function SettingsForm({ initial }: { initial: PanelSettings }) {
  const { run, busy } = useRun();
  const [s, setS] = useState(initial);
  const set = <K extends keyof PanelSettings>(k: K, v: PanelSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run("save", () => api("/api/admin/settings", "PUT", s), { success: "Settings saved" });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardHeader title="General" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Panel name">
            <input value={s.panelName} onChange={(e) => set("panelName", e.target.value)} required className={inputCls} />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Allow public registration</p>
              <p className="text-xs text-zinc-500">When off, only administrators can create accounts.</p>
            </div>
            <Toggle checked={s.allowRegistration} onChange={(v) => set("allowRegistration", v)} />
          </div>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-zinc-500">
          Node capacity, networking and SSH hosts are configured per node under{" "}
          <span className="font-medium text-zinc-300">Nodes</span> in the sidebar.
        </p>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy === "save"}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
