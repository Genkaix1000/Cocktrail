"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminClient from "./AdminClient";
import { eventsService } from "@/services/events.service";
import type { NightEvent, Order, CashSale } from "@cocktrail/shared";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const router = useRouter();
  const [initialEvent, setInitialEvent] = useState<NightEvent | null>(null);
  const [initialOrders, setInitialOrders] = useState<Order[]>([]);
  const [initialCashSales, setInitialCashSales] = useState<CashSale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    eventsService
      .getState()
      .then((state) => {
        setInitialEvent(state.event);
        setInitialOrders(state.orders);
        setInitialCashSales(state.cashSales);
        setLoading(false);
      })
      .catch(() => {
        // Si falla el fetch (ej. no autenticado), el middleware ya redirigió
        router.push("/login");
      });
  }, [router]);

  if (loading || !initialEvent) {
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
