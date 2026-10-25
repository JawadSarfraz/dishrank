import Link from "next/link";
import { AuthStatus } from "@/components/auth/AuthStatus";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-3xl font-bold">DishRank</h1>
      <p className="text-base">The best restaurants for each dish in Islamabad and Rawalpindi.</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/rate"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground"
        >
          Rate a dish
        </Link>
        <Link href="/me" className="inline-flex h-11 items-center px-2 underline">
          My ratings
        </Link>
      </div>
      <AuthStatus />
    </main>
  );
}
