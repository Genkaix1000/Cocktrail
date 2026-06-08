"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function QrRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin?tab=qr");
  }, [router]);

  return (
    <main className="min-h-screen bg-ink-950 text-ink-50 flex items-center justify-center">
      <p className="text-ink-400 text-sm animate-pulse">Redireccionando…</p>
    </main>
  );
}
