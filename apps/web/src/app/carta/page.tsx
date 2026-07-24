import { notFound } from "next/navigation";

/**
 * La sección de carta (autoservicio de cliente) está temporalmente deshabilitada.
 * Redirige a 404 para hacerla inaccesible.
 */
export default function CartaPage() {
  notFound();
}
