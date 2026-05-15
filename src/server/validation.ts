import { BadRequest } from "./errors";

export function asString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new BadRequest(`${field} requerido`);
  }
  return v;
}

export function asPositiveInt(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    throw new BadRequest(`${field} debe ser un entero positivo`);
  }
  return v;
}

export function asPositiveNumber(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    throw new BadRequest(`${field} debe ser un número positivo`);
  }
  return v;
}

export function asEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw new BadRequest(`${field} debe ser uno de: ${allowed.join(", ")}`);
  }
  return v as T;
}

export function asArray<T>(
  v: unknown,
  field: string,
  itemFn: (x: unknown, i: number) => T,
): T[] {
  if (!Array.isArray(v)) throw new BadRequest(`${field} debe ser un array`);
  if (v.length === 0) throw new BadRequest(`${field} no puede estar vacío`);
  return v.map((x, i) => itemFn(x, i));
}

export function asObject(v: unknown, field: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new BadRequest(`${field} debe ser un objeto`);
  }
  return v as Record<string, unknown>;
}
