# Fase 3C — deuda documentada al cierre de la Fase 3B

> Diseño validado en brainstorming. Agrupa 6 de los 11 hallazgos de la Fase 3B en una spec
> (mismo tratamiento SDD que Fases 2/3/3B). Los findings puramente mecánicos (duplicación de
> `accentColor` en `analytics/*`, `EmptyState` duplicado, `OSHeadbar` mezclando dos componentes,
> validación inalcanzable en `CashSaleModal`) se resuelven aparte, directo, sin spec, en la misma rama.

## Alcance

1. **`apps/web/src/services/*.ts` sin auditar** (10 archivos, ~200 líneas) — tests unitarios
   (mock de `fetch`) por servicio + revisión SOLID, mismo criterio que la auditoría de Fase 2 en
   `apps/api`.
2. **Patrón "modal montado permanentemente, solo `return null`"** — migrar los ~9 modales
   (`CashSaleModal`, `OpenNightModal`, `CloseNightModal`, `SafeDeleteModal`, `CancelOrderModal`,
   `ManualRedeemModal`, y los inline de `VentaSection`/`CartaSection`/`UsuariosSection`) a montaje
   condicional en el padre (`{ isOpen && <Modal ... /> }`). Elimina los workarounds de
   `isMounted`/`pendingTimers` (refs) agregados en Fase 3B para 3 de ellos — ese código se borra.
3. **`Ticket.tsx` (ticket virtual del cliente en `/carta`, no confundir con la impresora térmica)
   duplica el render de cada ítem** entre la sección "Ticket de Control" (línea ~228, sin precio) y
   "Recibo de Pago" (línea ~310, con precio) — mismo `drinks.find` + misma estructura de `<li>`
   copiada dos veces. Extraer `TicketItemRow` (recibe `item`, `drink` resuelto, `showPrice?`) y
   usarlo en ambos `.map()`.
4. **`Drink.vibe`** tiene datos reales en el seed ("PROMO AMIGOS", "FIESTA TOTAL", etc.) y
   `DrinkCardProps` ya declara `vibe?: string`, pero nadie se lo pasa. Decisión: **mostrarlo** en
   `DrinkCard` (badge/subtítulo bajo el nombre) y pasarlo desde donde se arma la carta del cliente.
5. **`GeneralSection`/`PagosSection` (y también `CartaSection` de `settings/`, que el roadmap daba
   por corregida pero solo hace `console.error` igual que las otras dos) tragan errores** de
   carga/guardado sin feedback visual. Extraer el `ToastItem` local de
   `components/barra/PendingOrdersList.tsx` (ya tiene el timer arreglado en Fase 3B) a
   `components/shared/Toast.tsx` genérico (variante éxito/error) y reusarlo en las 3 secciones de
   settings, incluyendo el toast de éxito ad-hoc que ya tiene `GeneralSection`.
6. **God-components de `settings/`**:
   - `UsuariosSection.tsx` (593 líneas) → `UsersTable` + `UserFormDrawer` (reusa `SafeDeleteModal`).
   - `CartaSection.tsx` de `settings/` (658 líneas) → `DrinksTable`/`DrinksGrid` + `DrinkFormModal`
     (acá entra el input nuevo de `vibe` del punto 4).

## Metodología

Test de caracterización antes de mover/extraer código en cada punto (igual que Fases 2/3/3B).
Auditoría con `architect-reviewer` + `expert-react-frontend-engineer`. Cierre con
`tsc --noEmit` + `eslint` + `vitest run` + `next build` en verde.

## Fuera de alcance de esta fase

- Findings mecánicos (ver nota arriba) — se resuelven directo en la misma rama, sin spec.
- Rediseño de la carga ficticia de `CloseNightModal` (decisión de UX, no técnica).
- Sacar `vibe` del contrato de dominio (se descartó: se decidió mostrarlo en vez de eliminarlo).
