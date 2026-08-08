import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { NightPreview } from "../modules/events/night-deletion.service.js";
import { collectNightDump, formatNightList, formatPreview, parseArgs, writeBackup } from "./delete-night.js";

const PREVIEW: NightPreview = {
  eventId: "11111111-1111-1111-1111-111111111111",
  status: "cerrado",
  fechaAr: "2026-08-07",
  keyword: "lluvia",
  startedAt: "2026-08-08T02:30:00+00:00",
  closedAt: "2026-08-08T08:00:00+00:00",
  pedidos: 3,
  pedidosCancelados: 1,
  totalFacturado: 8000,
  tickets: 2,
  cashSales: 1,
  cashSalesMonto: 1500,
  mpOrders: 2,
  mpOrdersCobrados: 2,
  mpMontoCobrado: 8000,
  mpSinEventId: 1,
};

describe("parseArgs", () => {
  it("acepta una fecha suelta y arranca en dry-run", () => {
    expect(parseArgs(["2026-08-07"])).toEqual({
      kind: "run",
      fecha: "2026-08-07",
      id: null,
      confirm: false,
      operator: "cli",
    });
  });

  it("--dry-run explícito no habilita el borrado", () => {
    const res = parseArgs(["2026-08-07", "--dry-run"]);
    expect(res).toMatchObject({ kind: "run", confirm: false });
  });

  it("--confirm habilita el borrado", () => {
    expect(parseArgs(["2026-08-07", "--confirm"])).toMatchObject({ kind: "run", confirm: true });
  });

  it("acepta --id con un uuid y un --operator", () => {
    expect(parseArgs(["--id", PREVIEW.eventId, "--operator", "manuel"])).toEqual({
      kind: "run",
      fecha: null,
      id: PREVIEW.eventId,
      confirm: false,
      operator: "manuel",
    });
  });

  it("rechaza fecha mal formada, uuid inválido, opción desconocida y falta de argumentos", () => {
    expect(parseArgs(["07/08/2026"])).toMatchObject({ kind: "error" });
    expect(parseArgs(["--id", "no-es-uuid"])).toMatchObject({ kind: "error" });
    expect(parseArgs(["--borra-todo"])).toMatchObject({ kind: "error" });
    expect(parseArgs([])).toMatchObject({ kind: "error" });
    expect(parseArgs(["2026-08-07", "2026-08-08"])).toMatchObject({ kind: "error" });
  });

  it("--help gana sobre cualquier otro argumento", () => {
    expect(parseArgs(["2026-08-07", "--confirm", "--help"])).toEqual({ kind: "help" });
  });
});

describe("formatPreview", () => {
  it("muestra fecha, plata y avisa de los cobros sin event_id", () => {
    const salida = formatPreview(PREVIEW);
    expect(salida).toContain("2026-08-07");
    expect(salida).toContain("$8.000");
    expect(salida).toContain("1 cancelados");
    expect(salida).toContain("no tienen event_id");
  });

  it("omite el aviso cuando todos los cobros están ligados", () => {
    expect(formatPreview({ ...PREVIEW, mpSinEventId: 0 })).not.toContain("no tienen event_id");
  });
});

describe("formatNightList", () => {
  it("lista una línea por noche con su id", () => {
    const salida = formatNightList([
      { ...PREVIEW, pedidos: 3 },
      { ...PREVIEW, eventId: "otra", pedidos: 0 },
    ]);
    expect(salida.split("\n")).toHaveLength(2);
    expect(salida).toContain("otra");
  });
});

/** Fake del query builder de supabase-js para los `.select()` del volcado. */
function makeClient(tablas: Record<string, unknown[]>) {
  const client = {
    from: (tabla: string) => {
      const filas = tablas[tabla] ?? [];
      const builder: any = {
        select: () => builder,
        eq: () => Promise.resolve({ data: filas, error: null }),
        in: () => Promise.resolve({ data: filas, error: null }),
        maybeSingle: () => Promise.resolve({ data: filas[0] ?? null, error: null }),
      };
      // `.eq(...).maybeSingle()` necesita que eq devuelva el builder, no una promesa.
      builder.eq = (..._args: unknown[]) => {
        const p: any = Promise.resolve({ data: filas, error: null });
        p.maybeSingle = () => Promise.resolve({ data: filas[0] ?? null, error: null });
        return p;
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return client;
}

describe("collectNightDump", () => {
  it("junta la noche, pedidos, tickets, cobros MP y ventas en efectivo sin duplicar cobros", async () => {
    const client = makeClient({
      night_events: [{ id: PREVIEW.eventId, status: "cerrado" }],
      orders: [{ id: "o1", mp_order_id: "mp1" }, { id: "o2", mp_order_id: null }],
      tickets: [{ id: "t1", order_id: "o1" }],
      // La misma fila vuelve por event_id y por el pedido que la referencia.
      mp_orders: [{ id: "mp1" }],
      cash_sales: [{ id: "c1" }],
    });

    const dump = await collectNightDump(client, PREVIEW.eventId, PREVIEW);

    expect(dump.resumen).toBe(PREVIEW);
    expect(dump.orders).toHaveLength(2);
    expect(dump.tickets).toHaveLength(1);
    expect(dump.mpOrders).toEqual([{ id: "mp1" }]);
    expect(dump.cashSales).toHaveLength(1);
  });
});

describe("writeBackup", () => {
  it("escribe el JSON con el nombre noche-<fecha>-<id>.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cocktrail-backup-"));

    const ruta = await writeBackup({ hola: 1 }, PREVIEW.fechaAr, PREVIEW.eventId, dir);

    expect(ruta).toBe(join(dir, `noche-2026-08-07-${PREVIEW.eventId}.json`));
    expect(JSON.parse(await readFile(ruta, "utf8"))).toEqual({ hola: 1 });
  });
});
