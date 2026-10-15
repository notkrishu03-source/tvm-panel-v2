import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NodeRedirectPage() {
  const user = await getCurrentUser();
  redirect(!user ? "/login" : user.role === "admin" ? "/admin/nodes" : "/dashboard");
}
