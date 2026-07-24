"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminClient from "./AdminClient";
import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";
import type { NightEvent, Order, Role } from "@cocktrail/shared";

type CurrentUser = {
  role: Role;
  username: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [initialEvent, setInitialEvent] = useState<NightEvent | null>(null);
  const [initialOrders, setInitialOrders] = useState<Order[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Preserva ?linked=true del callback OAuth al redirigir a login
  function redirectToLogin() {
    const params = new URLSearchParams(window.location.search);
    if (params.has("linked")) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    router.push("/login");
  }

  useEffect(() => {
    authService
      .getMe()
      .then((user) => {
        if (!user) {
          redirectToLogin();
          return;
        }
        if (user.role !== "admin") {
          const dest = user.role === "caja" ? "/caja" : "/barra";
          router.push(dest);
          return;
        }

        setCurrentUser({ role: user.role, username: user.username });

        eventsService
          .getState()
          .then((state) => {
            setInitialEvent(state.event);
            setInitialOrders(state.orders);
            setLoading(false);
          })
          .catch(() => {
            redirectToLogin();
          });
      })
      .catch(() => {
        redirectToLogin();
      });
  }, [router]);

  if (loading || !currentUser) {
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
      currentUser={currentUser}
    />
  );
}
