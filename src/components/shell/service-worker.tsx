"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production only. In dev it would cache
 * build output that changes on every edit and fight HMR.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("[macronaut] service worker registration failed", error);
      });
    };

    // Registering after load keeps it off the critical path.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
