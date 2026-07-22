import { beforeEach, describe, expect, it } from "vitest";

import {
  addPendingSale,
  listPendingSales,
  removePendingSale,
  updatePendingSale,
  type PendingSale,
} from "./pendingSales";

const STORAGE_KEY = "cocktrail:pendingSales";

function makeSale(overrides: Partial<PendingSale> = {}): PendingSale {
  return {
    id: "sale-1",
    createdAt: 1700000000000,
    paymentMethod: "qr",
    mpRef: "ORD01QR",
    amount: 2500,
    items: [{ drinkId: 1, qty: 1 }],
    attempts: 0,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("pendingSales", () => {
  it("lista vacía cuando no hay nada guardado", () => {
    expect(listPendingSales()).toEqual([]);
  });

  it("add + list roundtrip", () => {
    const sale = makeSale();
    addPendingSale(sale);
    expect(listPendingSales()).toEqual([sale]);
  });

  it("add acumula varias entradas en orden", () => {
    addPendingSale(makeSale({ id: "a" }));
    addPendingSale(makeSale({ id: "b", paymentMethod: "debito" }));
    expect(listPendingSales().map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("remove elimina solo la entrada indicada", () => {
    addPendingSale(makeSale({ id: "a" }));
    addPendingSale(makeSale({ id: "b" }));
    removePendingSale("a");
    expect(listPendingSales().map((s) => s.id)).toEqual(["b"]);
  });

  it("update aplica el patch sin tocar el resto", () => {
    addPendingSale(makeSale({ id: "a" }));
    addPendingSale(makeSale({ id: "b" }));
    updatePendingSale("a", { attempts: 2, lastError: "boom" });

    const [a, b] = listPendingSales();
    expect(a).toMatchObject({ id: "a", attempts: 2, lastError: "boom" });
    expect(b).toMatchObject({ id: "b", attempts: 0 });
  });

  it("JSON roto en la key no explota: list devuelve []", () => {
    localStorage.setItem(STORAGE_KEY, "{no es json[");
    expect(listPendingSales()).toEqual([]);
  });

  it("un valor que no es array no explota: list devuelve []", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hacked: true }));
    expect(listPendingSales()).toEqual([]);
  });

  it("entradas basura mezcladas se filtran, las válidas sobreviven", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([null, 42, { id: "sin-items" }, makeSale({ id: "ok" })]));
    expect(listPendingSales().map((s) => s.id)).toEqual(["ok"]);
  });

  it("add sobre una key rota la pisa con un array válido", () => {
    localStorage.setItem(STORAGE_KEY, "{roto");
    addPendingSale(makeSale({ id: "nuevo" }));
    expect(listPendingSales().map((s) => s.id)).toEqual(["nuevo"]);
  });
});
