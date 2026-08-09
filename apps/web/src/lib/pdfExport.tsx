/**
 * pdfExport.tsx — Genera el "Reporte de Facturación" (PDF) de Historial de Noches.
 *
 * `@react-pdf/renderer` se importa dinámicamente DENTRO de `exportHistorialPdf` (no en el
 * top-level del módulo): su código toca APIs de browser (fuentes, canvas) que romperían el
 * server-render de este client component si se evaluaran en el import estático, y así el
 * bundle de ~1-2MB de la librería solo se carga cuando el admin realmente exporta.
 *
 * Todo corre 100% en el cliente, sin red — no se registran fuentes remotas (Font.register con
 * URL) para no depender de internet (ver docs/ARCHITECTURE.md, local-first).
 */
import {
  computeNightRecords,
  computeWeeklyBreakdown,
  computeMonthlyBreakdown,
  groupNightsByDay,
  formatEventDuration,
} from "@/lib/analytics";
import { formatMoney } from "@/lib/utils";
import type { EventSummary } from "@cocktrail/shared";
import { displayRevenue } from "@cocktrail/shared";

type ExportInput = {
  historyEvents: EventSummary[];
  isBosko: boolean;
  logoUrl: string;
  useLogoUrl: boolean;
  textLogoValue: string;
};

const ACCENT = {
  bosko: "#16a34a",
  default: "#2563eb",
};

function formatShortDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Fondo oscuro de marca (--ink-950 en globals.css) — el logo de Bosko es texto claro/crema
 * pensado para verse sobre este fondo; sobre blanco queda casi invisible. */
const LOGO_BACKDROP = "#013e37";

/**
 * `@react-pdf/image` solo decodifica PNG/JPEG — el logo del theme puede ser `.webp`
 * (default de Bosko, `/bosko.webp`), que `<Image>` de react-pdf ignora en silencio (queda en
 * blanco, sin tirar error). Se rasteriza vía `<canvas>` a un data URI PNG, que sí soporta —
 * pintando primero el mismo fondo oscuro que usa la app, porque el logo es texto claro/crema
 * pensado para verse sobre ese fondo (sobre blanco queda casi invisible).
 */
function rasterizeToPngDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const padding = Math.round(Math.min(img.naturalWidth, img.naturalHeight) * 0.12);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth + padding * 2;
      canvas.height = img.naturalHeight + padding * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo obtener el contexto 2D del canvas"));
        return;
      }
      ctx.fillStyle = LOGO_BACKDROP;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, padding, padding);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error(`No se pudo cargar el logo: ${url}`));
    img.src = url;
  });
}

export async function exportHistorialPdf(input: ExportInput): Promise<void> {
  const { historyEvents, isBosko, logoUrl, useLogoUrl, textLogoValue } = input;
  const { pdf, Document, Page, View, Text, Image: PdfImage, StyleSheet } = await import(
    "@react-pdf/renderer"
  );

  const accent = isBosko ? ACCENT.bosko : ACCENT.default;

  const styles = StyleSheet.create({
    page: { padding: 32, fontSize: 10, color: "#18181b", backgroundColor: "#ffffff" },
    coverTitle: { fontSize: 20, fontFamily: "Times-Bold", color: accent, marginBottom: 4, textAlign: "center" },
    coverSubtitle: { fontSize: 10, color: "#71717a", marginBottom: 20, textAlign: "center" },
    logoRow: { alignItems: "center", marginBottom: 12 },
    logoImage: { height: 44, maxWidth: 180, objectFit: "contain" },
    logoText: { fontSize: 24, fontFamily: "Times-Italic", color: accent },
    statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
    statCard: {
      flex: 1,
      padding: 12,
      borderWidth: 1,
      borderColor: "#e4e4e7",
      borderRadius: 4,
    },
    statLabel: { fontSize: 8, color: "#71717a", textTransform: "uppercase", marginBottom: 4 },
    statValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#18181b" },
    sectionTitle: {
      fontSize: 13,
      fontFamily: "Helvetica-Bold",
      color: accent,
      marginTop: 20,
      marginBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: accent,
      paddingBottom: 4,
    },
    tableHeaderRow: {
      flexDirection: "row",
      backgroundColor: "#f4f4f5",
      paddingVertical: 5,
      paddingHorizontal: 6,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderBottomWidth: 1,
      borderBottomColor: "#f0f0f0",
    },
    tableHeaderCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#52525b", textTransform: "uppercase" },
    tableCell: { fontSize: 9, color: "#27272a" },
    footer: {
      position: "absolute",
      bottom: 16,
      left: 32,
      right: 32,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7,
      color: "#a1a1aa",
    },
  });

  const allTotal = historyEvents.reduce((s, e) => s + displayRevenue(e.totals), 0);
  const nightRecords = computeNightRecords(historyEvents);
  const topDrink = nightRecords[0];
  const weeklyBreakdown = computeWeeklyBreakdown(historyEvents);
  const monthlyBreakdown = computeMonthlyBreakdown(historyEvents);
  const nights = groupNightsByDay(historyEvents).sort((a, b) => b.closedAt - a.closedAt);

  const generatedAt = new Date().toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const logoSrc = useLogoUrl && logoUrl
    ? await rasterizeToPngDataUrl(new URL(logoUrl, window.location.origin).toString()).catch(() => null)
    : null;

  const Footer = () => (
    <Text
      fixed
      style={styles.footer}
      render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}  ·  Generado el ${generatedAt}`}
    />
  );

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.logoRow}>
          {logoSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <PdfImage src={logoSrc} style={styles.logoImage} />
          ) : (
            <Text style={styles.logoText}>{textLogoValue || "Bosko"}</Text>
          )}
        </View>
        <Text style={styles.coverTitle}>Reporte de Facturación</Text>
        <Text style={styles.coverSubtitle}>Generado el {generatedAt}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Facturado</Text>
            <Text style={styles.statValue}>{formatMoney(allTotal)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total de Noches</Text>
            <Text style={styles.statValue}>{historyEvents.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Trago Estrella</Text>
            <Text style={styles.statValue}>{topDrink ? topDrink.value : "—"}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Facturación Semanal</Text>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { width: "50%" }]}>Semana</Text>
          <Text style={[styles.tableHeaderCell, { width: "20%" }]}>Noches</Text>
          <Text style={[styles.tableHeaderCell, { width: "30%" }]}>Total Facturado</Text>
        </View>
        {weeklyBreakdown.map((w) => (
          <View key={w.weekStart} style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: "50%" }]}>
              {formatShortDate(w.weekStart)} – {formatShortDate(w.weekEnd)}
            </Text>
            <Text style={[styles.tableCell, { width: "20%" }]}>{w.nightsCount}</Text>
            <Text style={[styles.tableCell, { width: "30%" }]}>{formatMoney(w.total)}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Facturación Mensual</Text>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { width: "50%" }]}>Mes</Text>
          <Text style={[styles.tableHeaderCell, { width: "20%" }]}>Noches</Text>
          <Text style={[styles.tableHeaderCell, { width: "30%" }]}>Total Facturado</Text>
        </View>
        {monthlyBreakdown.map((m) => (
          <View key={m.monthStart} style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: "50%" }]}>{m.monthLabel}</Text>
            <Text style={[styles.tableCell, { width: "20%" }]}>{m.nightsCount}</Text>
            <Text style={[styles.tableCell, { width: "30%" }]}>{formatMoney(m.total)}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Detalle Noche por Noche</Text>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { width: "18%" }]}>Fecha</Text>
          <Text style={[styles.tableHeaderCell, { width: "18%" }]}>Recaudado</Text>
          <Text style={[styles.tableHeaderCell, { width: "18%" }]}>Tickets</Text>
          <Text style={[styles.tableHeaderCell, { width: "34%" }]}>Top Trago</Text>
          <Text style={[styles.tableHeaderCell, { width: "12%" }]}>Duración</Text>
        </View>
        {nights.map((night) => {
          const top = night.totals.drinksSold[0];
          return (
            <View key={night.dateKey} style={styles.tableRow} wrap={false}>
              <Text style={[styles.tableCell, { width: "18%" }]}>{formatShortDate(night.closedAt)}</Text>
              <Text style={[styles.tableCell, { width: "18%" }]}>{formatMoney(displayRevenue(night.totals))}</Text>
              <Text style={[styles.tableCell, { width: "18%" }]}>{night.orderCounter}</Text>
              <Text style={[styles.tableCell, { width: "34%" }]}>{top ? `${top.name} (×${top.qty})` : "—"}</Text>
              <Text style={[styles.tableCell, { width: "12%" }]}>
                {formatEventDuration(night.startedAt, night.closedAt)}
              </Text>
            </View>
          );
        })}

        <Footer />
      </Page>
    </Document>
  );

  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "reporte-facturacion-bosko.pdf");
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
