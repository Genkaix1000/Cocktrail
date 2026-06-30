"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CajaClient from "./CajaClient";
import { drinksService } from "@/services/drinks.service";
import { authService } from "@/services/auth.service";
import type { Drink } from "@cocktrail/shared";

export default function CajaPage() {
  const router = useRouter();
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .getMe()
      .then((user) => {
        if (!user) {
          router.push("/login");
          return;
        }
        if (user.role !== "caja") {
          const dest = user.role === "admin" ? "/admin" : "/barra";
          router.push(dest);
          return;
        }

        drinksService
          .list()
          .then((data) => {
            setDrinks(data);
            setLoading(false);
          })
          .catch(() => {
            router.push("/login");
          });
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-ink-950 text-ink-50 flex items-center justify-center">
        <p className="text-ink-400 text-sm animate-pulse">Cargando caja…</p>
      </main>
    );
  }

  return <CajaClient drinks={drinks} />;
}
