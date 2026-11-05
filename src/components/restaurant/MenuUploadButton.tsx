"use client";

// "Upload menu photo" (docs/07 §3), only for panel members, the restaurant's owner and admins: the
// page is static, so the browser asks the server whether to show it. The photo is resized to
// ≤ 1600 px and re-encoded in the browser (no EXIF/GPS), sent to the private menus bucket with a
// 10-minute signed URL, then filed as a pending menu upload for an admin to read.
import { useEffect, useId, useState } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { authClient } from "@/lib/auth-client";
import { preparePhoto } from "@/lib/image";
import { menuUploadAccessAction, submitMenuUploadAction } from "@/server/actions/menu";
import { signPhotoUploadAction } from "@/server/actions/rating";

export function MenuUploadButton({ restaurantId }: { restaurantId: string }) {
  const inputId = useId();
  const { data } = authClient.useSession();
  const userId = data?.user.id ?? null;
  // Whom the answer is for: after a sign-out or a switch of account it no longer applies.
  const [access, setAccess] = useState<{ userId: string; allowed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    menuUploadAccessAction(restaurantId)
      .then((res) => {
        if (live) setAccess({ userId, allowed: Boolean(res.data?.allowed) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId, restaurantId]);

  if (!userId || access?.userId !== userId || !access.allowed) return null;

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setStatus("Preparing the photo…");
    try {
      const blob = await preparePhoto(file);
      const signed = await signPhotoUploadAction({
        kind: "menu",
        restaurantId,
        contentType: blob.type,
        sizeBytes: blob.size,
      });
      if (signed.error) throw new Error(describeActionError(signed.error));
      setStatus("Uploading…");
      const res = await fetch(signed.data.uploadUrl, {
        method: signed.data.method,
        headers: signed.data.headers,
        body: blob,
      });
      if (!res.ok) throw new Error("The upload failed. Try again.");
      const filed = await submitMenuUploadAction({ restaurantId, path: signed.data.path });
      if (filed.error) throw new Error(describeActionError(filed.error));
      setStatus("Thanks! The menu photo is in. Our team reads it and adds its dishes.");
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "The menu photo could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-card"
    >
      <h2 id={`${inputId}-title`} className="text-xl font-bold">
        Menu photo
      </h2>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        disabled={busy}
        className="peer sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void upload(file);
        }}
      />
      <label
        htmlFor={inputId}
        aria-disabled={busy}
        className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-lg border bg-card px-4 text-base font-medium hover:bg-muted aria-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
      >
        {status?.startsWith("Thanks") ? "Upload another page" : "Upload menu photo"}
      </label>
      <p className="text-sm text-muted-foreground">One page per photo, flat and in good light.</p>
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
