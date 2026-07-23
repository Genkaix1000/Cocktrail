"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BarraClient from "./BarraClient";
import { authService } from "@/services/auth.service";

export default function BarraPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .getMe()
      .then((user) => {
        if (!user) {
          router.push("/login");
          return;
        }
        if (user.role !== "admin") {
          const dest = user.role === "caja" ? "/caja" : "/login";
          router.push(dest);
          return;
        }
        setLoading(false);
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-ink-950 text-ink-50 flex items-center justify-center">
        <p className="text-ink-400 text-sm animate-pulse">Cargando barra…</p>
      </main>
    );
  }

  return <BarraClient />;
}
