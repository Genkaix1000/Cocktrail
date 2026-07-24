import { notFound } from "next/navigation";

/**
 * La vista pública de seguimiento de pedido está temporalmente deshabilitada.
 * Redirige a 404 para hacerla inaccesible.
 */
export default function PedidoPage() {
  notFound();
}
