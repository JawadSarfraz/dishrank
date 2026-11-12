"use client";

// Keeps the source tag (docs/01 D1b): the first ?s= tag goes in a first-party cookie for 7 days
// (the tag only) that the browser's events and the sign-up carry. The address is read only in the browser,
// so the cached pages stay static and their canonical URLs stay clean.
import { useEffect } from "react";
import { sourceCookie, sourceFromCookies, sourceFromSearch, visitSource } from "@/lib/source-tag";

export function SourceTag() {
  useEffect(() => {
    try {
      const stored = sourceFromCookies(document.cookie);
      const kept = visitSource(stored, sourceFromSearch(window.location.search));
      if (kept && kept !== stored) {
        document.cookie = sourceCookie(kept, window.location.protocol === "https:");
      }
    } catch {
      // Blocked cookies: the visit simply has no source.
    }
  }, []);
  return null;
}
