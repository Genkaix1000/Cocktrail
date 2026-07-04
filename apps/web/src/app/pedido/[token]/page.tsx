"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TicketLive from "@/components/carta/TicketLive";
import { ordersService } from "@/services/orders.service";
import type { Order } from "@cocktrail/shared";

export const dynamic = "force-dynamic";

export default function PedidoPage() {
  const params = useParams<{ token: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!params.token) return;
    ordersService
      .getByToken(params.token)
      .then(setOrder)
      .catch(() => setNotFound(true));
  }, [params.token]);

  if (notFound) {
    return (
      <main className="min-h-screen bg-ink-950 text-ink-50 flex items-center justify-center">
        <p className="text-ink-400 text-sm">Pedido no encontrado</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-ink-950 text-ink-50 flex items-center justify-center">
        <p className="text-ink-400 text-sm animate-pulse">Cargando ticket…</p>
      </main>
    );
  }

  return <TicketLive initialOrder={order} />;
}
