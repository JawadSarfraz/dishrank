"use client";

// Optional dish photo: resized to ≤ 1600 px and re-encoded in the browser (no EXIF/GPS), then sent
// straight to storage with a 10-minute signed URL (docs/06 POST /api/v1/uploads/sign).
import { CameraIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { describeActionError } from "@/components/admin/action-error";
import { Button } from "@/components/ui/button";
import { preparePhoto } from "@/lib/image";
import { signPhotoUploadAction } from "@/server/actions/rating";

export function PhotoPicker({
  current,
  onUploaded,
  onBusy,
}: {
  current: string | null;
  onUploaded: (path: string | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const inputId = useId();
  // Cleared after every pick, so choosing the same file again (after a failure or "Remove") works.
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(current ? "A photo is attached." : null);
  const [error, setError] = useState<string | null>(null);
  // One upload at a time: the input is disabled until it ends, so Submit never waits on a second.
  const [busy, setBusy] = useState(false);

  async function choose(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setStatus("Preparing the photo…");
    setBusy(true);
    onBusy(true);
    try {
      const blob = await preparePhoto(file);
      const signed = await signPhotoUploadAction({
        kind: "dish-photo",
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
      setPreview(URL.createObjectURL(blob));
      setStatus("Photo attached.");
      onUploaded(signed.data.path);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "The photo could not be uploaded.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Photo (optional)</span>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        ref={input}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void choose(file);
        }}
        className="peer sr-only"
      />
      <label
        htmlFor={inputId}
        aria-disabled={busy}
        className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border bg-card px-4 text-base font-medium hover:bg-muted aria-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
      >
        <CameraIcon aria-hidden="true" className="size-5" />
        {preview || current ? "Change photo" : "Add a photo"}
      </label>
      {preview && (
        // A local object URL of the photo just chosen; never a remote image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your dish photo" className="max-h-48 w-fit rounded-lg" />
      )}
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {(preview || current) && (
        <Button
          type="button"
          variant="link"
          className="min-h-11 w-fit justify-start"
          onClick={() => {
            setPreview(null);
            setStatus(null);
            if (input.current) input.current.value = "";
            onUploaded(null);
          }}
        >
          Remove photo
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
