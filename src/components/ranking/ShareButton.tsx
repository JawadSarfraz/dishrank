"use client";

// Share a page with the phone's share sheet (Web Share), or copy the link where that is missing.
// The text reads well as a WhatsApp message; the link is added after it.
import { useState } from "react";

export function ShareButton({ title, text, path }: { title: string; text: string; path: string }) {
  const [status, setStatus] = useState<string | null>(null);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return; // the diner closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setStatus("Link copied. Paste it in a chat.");
    } catch {
      setStatus(url);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={share}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-base font-medium"
      >
        Share this list
      </button>
      {status && (
        <p role="status" className="text-sm break-all">
          {status}
        </p>
      )}
    </div>
  );
}
