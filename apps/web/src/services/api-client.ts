import { API_URL } from "@/config/env";
import { ACTIVE_BAR_STORAGE_KEY } from "@/lib/bar-context";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetch centralizado contra el backend. Cuando NEXT_PUBLIC_API_URL está vacío,
 * los fetches van a rutas relativas (proxy local). Cuando tiene un valor,
 * van al backend externo. Cero cambios en los componentes.
 */
export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers = {}, signal } = opts;
  const activeBarId =
    typeof window !== "undefined"
      ? localStorage.getItem(ACTIVE_BAR_STORAGE_KEY)
      : null;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(activeBarId ? { "X-Bar-Id": activeBarId } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error desconocido" }));
    throw new ApiError(res.status, err.error ?? `HTTP ${res.status}`, err);
  }

  // Algunos endpoints devuelven null (ej. GET /api/auth/me sin sesión)
  const text = await res.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}
