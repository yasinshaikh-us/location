"use client";

import { useEffect } from "react";

/** Registers the no-op/no-cache service worker needed for PWA installability. */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: the app still works, it just won't be installable.
      });
    }
  }, []);

  return null;
}
