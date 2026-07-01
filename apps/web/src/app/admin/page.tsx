"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminClient from "./AdminClient";
import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";
import type { NightEvent, Order, CashSale } from "@cocktrail/shared";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const router = useRouter();
  const [initialEvent, setInitialEvent] = useState<NightEvent | null>(null);
  const [initialOrders, setInitialOrders] = useState<Order[]>([]);
  const [initialCashSales, setInitialCashSales] = useState<CashSale[]>([]);
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
          const dest = user.role === "caja" ? "/caja" : "/barra";
          router.push(dest);
          return;
        }

        eventsService
          .getState()
          .then((state) => {
            setInitialEvent(state.event);
            setInitialOrders(state.orders);
            setInitialCashSales(state.cashSales);
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
        <p className="text-ink-400 text-sm animate-pulse">Cargando panel…</p>
      </main>
    );
  }

  return (
    <AdminClient
      initialEvent={initialEvent}
      initialOrders={initialOrders}
      initialCashSales={initialCashSales}
    />
  );
}
