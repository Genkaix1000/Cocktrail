"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminClient from "./AdminClient";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";
import type { EventTotals, NightEvent, Order, Role } from "@cocktrail/shared";

type CurrentUser = {
  role: Role;
  username: string;
  isSuperadmin?: boolean;
};

export default function AdminPage() {
  const router = useRouter();
  const [initialEvent, setInitialEvent] = useState<NightEvent | null>(null);
  const [initialOrders, setInitialOrders] = useState<Order[]>([]);
  const [initialTotals, setInitialTotals] = useState<EventTotals | null>(null);
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
          const dest = user.role === "caja" ? "/caja" : "/login";
          router.push(dest);
          return;
        }

        setCurrentUser({ role: user.role, username: user.username, isSuperadmin: user.isSuperadmin });

        eventsService
          .getState()
          .then((state) => {
            setInitialEvent(state.event);
            setInitialOrders(state.orders);
            setInitialTotals(state.totals ?? null);
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
    return <LoadingScreen label="Cargando panel…" />;
  }

  return (
    <AdminClient
      initialEvent={initialEvent}
      initialOrders={initialOrders}
      initialTotals={initialTotals}
      currentUser={currentUser}
    />
  );
}
