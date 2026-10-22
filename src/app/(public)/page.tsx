import { AuthStatus } from "@/components/auth/AuthStatus";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-3xl font-bold">DishRank</h1>
      <p className="text-base">The best restaurants for each dish in Islamabad and Rawalpindi.</p>
      <AuthStatus />
    </main>
  );
}
