"use client";

// The /dispute form: anyone, signed in or not, can tell us a listing or ranking is wrong. It becomes
// a review item for the admins.
import { useState, useTransition } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { fileDisputeAction } from "@/server/actions/report";

const field = "rounded-lg border border-input bg-transparent px-3 py-2 text-base";

export function DisputeForm() {
  const [page, setPage] = useState("");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fileDisputeAction({
          message: message.trim(),
          contact: contact.trim() || undefined,
          page: page.trim() || undefined,
        });
        if (res.error) setError(describeActionError(res.error));
        else setSent(true);
      } catch {
        setError("Your message did not reach us. Try again.");
      }
    });
  }

  if (sent) {
    return (
      <p role="status" className="rounded-lg border px-3 py-3">
        Thanks. Our team will look at it.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        Which page or restaurant is it about? (optional)
        <input
          value={page}
          onChange={(e) => setPage(e.target.value)}
          maxLength={300}
          placeholder="A link or a name"
          className={`${field} h-11`}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        What is wrong?
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={10}
          maxLength={1000}
          rows={5}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        How can we reach you? (optional)
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={200}
          placeholder="E-mail or phone"
          className={`${field} h-11`}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground"
      >
        {pending ? "Sending…" : "Send"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
