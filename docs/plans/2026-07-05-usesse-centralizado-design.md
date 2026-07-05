# Resolver la deuda de "useSSE centralizado" (Fase 3B/3C)

> Diseño validado en brainstorming. Resuelve el último hallazgo abierto de la Fase 3B que
> quedaba como deuda: no es un problema del hook `useSSE.ts` en sí (~86 líneas, genérico,
> tipado, bien hecho), sino de cómo `AdminClient.tsx`/`CajaClient.tsx` duplican código casi
> idéntico al usarlo, y de que ningún shell tiene test de integración SSE.

## Diagnóstico

- `AdminClient` y `CajaClient` duplican byte-a-byte: la función `refetch()` (llama
  `eventsService.getState()`, setea `event`/`orders`/`cashSales`), y los handlers
  `order.created`/`order.updated`/`cash_sale.added`/`event.opened` con el mismo patrón
  "upsert por id en el array". Admin además llama `fetchSystemLogs()` en cada uno de los 3
  primeros eventos.
- `BarraClient` tiene handlers genuinamente distintos (cola de pedidos pendientes, toasts,
  modo dev, `localStorage`) — no comparte el molde de Admin/Caja y no se fuerza a la misma
  abstracción.
- Cero tests tocan `EventSource`/`useSSE` en todo el repo — es la causa real del "alto riesgo"
  documentado en la Fase 3B.

## Diseño

### 1. `useEventState()` — nuevo hook, `apps/web/src/hooks/useEventState.ts`

Encapsula estado + `refetch()` + las 5 suscripciones SSE compartidas (`order.created`,
`order.updated`, `cash_sale.added`, `event.opened`, `event.closed`) para **Admin y Caja
únicamente**. `BarraClient` sigue llamando `useSSE` directo, sin cambios.

```ts
function useEventState(options?: {
  onActivity?: () => void;                      // tras order.created/updated/cash_sale.added
  onEventClosed?: (summary: EventSummary) => void; // tras event.closed (summary ya seteado)
}): {
  event: NightEvent | null;
  orders: Order[];
  cashSales: CashSale[];
  summary: EventSummary | null;
  setEvent: (e: NightEvent | null) => void;
  setSummary: (s: EventSummary | null) => void;
  refetch: () => Promise<void>;
}
```

`setOrders`/`setCashSales` no se exponen (nadie fuera del hook los necesita hoy).
`setEvent`/`setSummary` sí, porque los shells los usan en flujos que no son SSE
(`handleCloseConfirm` setea `summary` con la respuesta HTTP directa del POST de cierre;
`handleModalClose` limpia `summary` al cerrar el modal de resumen).

`event.opened` y el `onOpen` (llama `refetch()`) son idénticos hoy en ambos shells — el hook
los maneja 100% interno, sin callback.

### 2. Shells resultantes

`AdminClient.tsx`:
```ts
const { event, orders, cashSales, summary, setEvent, setSummary, refetch } = useEventState({
  onActivity: fetchSystemLogs,
  onEventClosed: () => { setModalOpen(true); setHistoryLoaded(false); },
});
```
`CajaClient.tsx` (sin `onActivity`):
```ts
const { event, orders, cashSales, summary, setEvent, setSummary, refetch } = useEventState({
  onEventClosed: () => setCloseModalOpen(true),
});
```
Se borran de ambos shells: los `useState` locales de `event`/`orders`/`cashSales`/`summary`, la
función `refetch`, y el bloque `useSSE({...})` completo.

### 3. Testing

- `apps/web/src/lib/__testUtils__/fakeEventSource.ts` (nuevo): clase mínima que implementa lo
  que `useSSE` usa realmente (`addEventListener`/`removeEventListener`/`close`) + `emit(type,
  data)` y `emitOpen()` para simular frames del servidor en tests. Se instala con
  `vi.stubGlobal("EventSource", FakeEventSource)`.
- `useSSE.test.ts` (nuevo, hoy no existe): despacha el handler correcto por `type` con el data
  parseado; ignora JSON malformado sin romper; llama `onOpen`; limpia listeners y cierra la
  conexión al desmontar.
- `useEventState.test.ts` (nuevo): upsert-por-id en `order.created`/`order.updated`/
  `cash_sale.added`; `event.opened` setea `event` + dispara `refetch` (mock de
  `eventsService.getState`); `event.closed` setea `summary` + llama `onEventClosed`;
  `onActivity` se llama una vez por evento de actividad, y no se llama si no se pasa la opción.
- No se agregan tests a `AdminClient`/`CajaClient` (no tienen test propio hoy, son shells) — la
  cobertura de integración SSE vive en el hook, que es donde está toda la lógica ahora.

## Fuera de alcance

- `BarraClient.tsx` no se toca — su lógica no comparte el molde y forzarla sería peor que la
  duplicación actual.
- `CloseNightModal` (carga ficticia de 3.2s) sigue como decisión de producto/UX pendiente, sin
  relación con esta feature.
- No se extrae un helper genérico de "upsert por id" a un archivo compartido — vive privado
  dentro de `useEventState.ts` porque hoy solo lo usa ese hook (YAGNI; si `BarraClient` lo
  necesita a futuro, se extrae en ese momento).
