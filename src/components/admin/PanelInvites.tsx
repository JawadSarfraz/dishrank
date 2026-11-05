"use client";

// /admin/users: create a panel invite link, see who joined through each, revoke one. The full link
// is shown once, right after creating it: only its hash is stored.
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPanelInviteAction, revokePanelInviteAction } from "@/server/actions/admin-users";
import type { PanelInviteRow } from "@/server/services/panel-invite.service";
import { describeActionError } from "./action-error";

const UNREACHABLE = "The request did not reach the server. Try again.";

const date = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" });

const STATE_LABEL: Record<PanelInviteRow["state"], string> = {
  usable: "Open",
  revoked: "Revoked",
  expired: "Expired",
  full: "Full",
  unknown: "Unknown",
};

function CreateInvite({ defaults }: { defaults: { maxUses: number; days: number } }) {
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    setError(null);
    setLink(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const res = await createPanelInviteAction({
          label: form.get("label"),
          maxUses: Number(form.get("maxUses")),
          expiresInDays: Number(form.get("expiresInDays")),
        });
        if (res.error) setError(describeActionError(res.error));
        else setLink(res.data.url);
      } catch {
        setError(UNREACHABLE);
      }
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Copying is blocked here: select the link and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Label
          <Input
            name="label"
            required
            maxLength={80}
            placeholder="e.g. Food group, November"
            className="h-10 w-64 max-w-full"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Max uses
          <Input
            name="maxUses"
            type="number"
            required
            min={1}
            max={500}
            defaultValue={defaults.maxUses}
            className="h-10 w-24"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Expires in (days)
          <Input
            name="expiresInDays"
            type="number"
            required
            min={1}
            max={90}
            defaultValue={defaults.days}
            className="h-10 w-24"
          />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Creating…" : "Create link"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {link && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
          <p className="text-sm font-medium">
            Copy it now: this link is shown only once, because only its hash is stored.
          </p>
          <code className="break-all text-sm">{link}</code>
          <Button type="button" size="sm" variant="secondary" className="self-start" onClick={copy}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
    </div>
  );
}

function RevokeInvite({ id, label }: { id: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={`Revoke the link ${label}`}
        onClick={() => {
          if (!window.confirm(`Revoke "${label}"? People who joined stay on the panel.`)) return;
          startTransition(async () => {
            try {
              const res = await revokePanelInviteAction(id);
              setError(res.error ? describeActionError(res.error) : null);
            } catch {
              setError(UNREACHABLE);
            }
          });
        }}
      >
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

export function PanelInvites({
  invites,
  defaults,
}: {
  invites: PanelInviteRow[];
  defaults: { maxUses: number; days: number };
}) {
  return (
    <section aria-labelledby="panel-invites" className="flex flex-col gap-3">
      <h2 id="panel-invites" className="text-lg font-bold">
        Panel invite links
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Whoever signs in through a link joins the panel and passes the beta allowlist. Revoking a
        link stops new joins; people who joined stay until you turn the panel off for them below.
      </p>
      <CreateInvite defaults={defaults} />
      {invites.length > 0 && (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card text-sm shadow-card">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-medium break-anywhere">
                    {invite.label}
                    <Badge variant={invite.state === "usable" ? "default" : "outline"}>
                      {STATE_LABEL[invite.state]}
                    </Badge>
                  </span>
                  <span className="text-muted-foreground">
                    {invite.usesCount} of {invite.maxUses} used · expires{" "}
                    {date.format(invite.expiresAt)} · created {date.format(invite.createdAt)}
                  </span>
                </div>
                {!invite.revokedAt && <RevokeInvite id={invite.id} label={invite.label} />}
              </div>
              {invite.uses.length > 0 && (
                <ul className="flex flex-col gap-0.5 text-muted-foreground">
                  {invite.uses.map((use) => (
                    <li key={use.user.id} className="break-anywhere">
                      {use.user.name} ({use.user.email}), joined {date.format(use.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
