import type { ReactNode } from "react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { nodes } from "@/db/schema";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [settings, [firstNode]] = await Promise.all([
    getSettings(),
    db.select().from(nodes).orderBy(asc(nodes.id)).limit(1),
  ]);

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar
        username={user.username}
        role={user.role}
        panelName={settings.panelName}
        nodeName={firstNode?.name ?? "—"}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
