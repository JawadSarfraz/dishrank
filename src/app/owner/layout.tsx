import type { Metadata } from "next";
import { Forbidden } from "@/components/auth/Forbidden";
import { requirePageRole } from "@/server/auth";

export const metadata: Metadata = {
  title: "Owner · DishRank",
  robots: { index: false, follow: false },
};

// Owner routes allow OWNER and ADMIN (docs/06). Every page also calls requirePageRole.
export default async function OwnerLayout({ children }: LayoutProps<"/owner">) {
  const user = await requirePageRole(["OWNER", "ADMIN"], "/owner");
  if (!user) return <Forbidden />;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">{children}</div>
  );
}
