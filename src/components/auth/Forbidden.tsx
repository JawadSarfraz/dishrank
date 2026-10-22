import Link from "next/link";

/** Shown to signed-in users without the role. The admin/owner layouts set noindex for these routes. */
export function Forbidden() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold">Forbidden</h1>
      <p>You don&apos;t have access to this page.</p>
      <Link href="/" className="underline">
        Back to DishRank
      </Link>
    </main>
  );
}
