"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <button type="button" onClick={reset} className="w-fit underline">
        Try again
      </button>
    </main>
  );
}
