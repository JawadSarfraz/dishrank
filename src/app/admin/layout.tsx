import type { Metadata } from "next";
import Link from "next/link";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";

export const metadata: Metadata = {
  title: "Admin · DishRank",
  robots: { index: false, follow: false },
};

const sections = [
  ["/admin", "Overview"],
  ["/admin/import", "Import"],
  ["/admin/review", "Review queue"],
  ["/admin/restaurants", "Restaurants"],
  ["/admin/users", "Users"],
  ["/admin/rankings", "Rankings"],
] as const;

// Every page under admin/ also calls requirePageRole: layouts do not re-run on client navigation.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePageRole("ADMIN", "/admin");
  if (!user) return <Forbidden />;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <nav aria-label="Admin" className="flex flex-wrap gap-4 text-sm">
        {sections.map(([href, label]) => (
          <Link key={href} href={href} className="underline">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
