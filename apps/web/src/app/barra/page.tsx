import { notFound } from "next/navigation";

/**
 * La sección de barra está temporalmente deshabilitada.
 * Redirige a 404 para hacerla inaccesible.
 */
export default function BarraPage() {
  notFound();
}
