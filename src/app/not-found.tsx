import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link href="/" className="underline">
        Back to DishRank
      </Link>
    </main>
  );
}
