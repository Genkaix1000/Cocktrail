import { describe, expect, it } from "vitest";
import {
  addOneToPaper,
  onePaperPerUnit,
  poolFromCart,
  removeOneFromPaper,
  splitConfigOk,
  type PrintPaper,
} from "./split-print";

describe("split-print", () => {
  const cart = { 1: 3, 2: 1 };

  it("onePaperPerUnit arma un papel por unidad", () => {
    expect(onePaperPerUnit({ 1: 3 })).toEqual([{ 1: 1 }, { 1: 1 }, { 1: 1 }]);
    expect(splitConfigOk({ 1: 3 }, onePaperPerUnit({ 1: 3 }))).toBe(true);
  });

  it("pool baja al asignar y splitConfigOk exige ≥2 papeles exactos", () => {
    expect(poolFromCart(cart, [{}])).toEqual(cart);
    const papers: PrintPaper[] = [{ 1: 1 }, { 1: 2, 2: 1 }];
    expect(poolFromCart(cart, papers)).toEqual({});
    expect(splitConfigOk(cart, papers)).toBe(true);
    expect(splitConfigOk(cart, [{ 1: 3, 2: 1 }])).toBe(false);
  });

  it("add/remove mueven de a una y apilan el mismo trago", () => {
    let papers = [{}];
    papers = addOneToPaper(cart, papers, 0, 1);
    papers = addOneToPaper(cart, papers, 0, 1);
    expect(papers).toEqual([{ 1: 2 }]);
    expect(poolFromCart(cart, papers)).toEqual({ 1: 1, 2: 1 });
    papers = removeOneFromPaper(papers, 0, 1);
    expect(papers).toEqual([{ 1: 1 }]);
  });
});
