"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BarraClient from "./BarraClient";
import { authService } from "@/services/auth.service";

export const dynamic = "force-dynamic";

export default function BarraPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .getMe()
      .then((user) => {
        if (!user || (user.role !== "admin" && user.role !== "barman")) {
          router.push("/login");
        } else {
          setLoading(false);
        }
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
