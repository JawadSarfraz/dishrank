import type { Metadata } from "next";
import { Forbidden } from "@/components/auth/Forbidden";
import { AdminNav } from "@/components/admin/AdminNav";
import { requirePageRole } from "@/server/auth";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Every page under admin/ also calls requirePageRole: layouts do not re-run on client navigation.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePageRole("ADMIN", "/admin");
  if (!user) return <Forbidden />;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:flex-row lg:gap-8">
      <AdminNav />
      <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
    </div>
  );
}
