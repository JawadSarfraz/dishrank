"use client";

// The /dispute form: anyone, signed in or not, can tell us a listing or ranking is wrong. It becomes
// a review item for the admins.
import { CheckIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { Button } from "@/components/ui/button";
import { fileDisputeAction } from "@/server/actions/report";

const label = "flex flex-col gap-1.5 text-[15px] leading-5 font-bold";

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
      <p
        role="status"
        className="flex max-w-prose items-center gap-3 rounded-block bg-blush p-4 text-[15px] font-bold"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-white"
        >
          <CheckIcon className="size-5" strokeWidth={3} />
        </span>
        Thanks. Our team will look at it.
      </p>
    );
  }

  return (
    <form
      className="flex max-w-prose flex-col gap-4 rounded-card border bg-card p-4 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label className={label}>
        Which page or restaurant is it about? (optional)
        <input
          value={page}
          onChange={(e) => setPage(e.target.value)}
          maxLength={300}
          placeholder="A link or a name"
          className="field font-normal"
        />
      </label>
      <label className={label}>
        What is wrong?
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={10}
          maxLength={1000}
          rows={5}
          className="field py-3 font-normal"
        />
      </label>
      <label className={label}>
        How can we reach you? (optional)
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={200}
          placeholder="E-mail or phone"
          className="field font-normal"
        />
      </label>
      <Button type="submit" size="lg" disabled={pending} className="sm:w-fit sm:px-10">
        {pending ? "Sending…" : "Send"}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
