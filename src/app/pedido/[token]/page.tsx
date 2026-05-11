import { notFound } from "next/navigation";
import TicketLive from "@/components/TicketLive";
import { getOrderByToken } from "@/server/store";

// Sin cache: cada visita renderea con el snapshot fresco del store.
// El cliente abre el EventSource desde TicketLive para mantenerse sincronizado.
export const dynamic = "force-dynamic";

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = getOrderByToken(token);
  if (!order) notFound();
  return <TicketLive initialOrder={order} />;
}
