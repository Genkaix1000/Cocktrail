# CRUD Carta — tabla estándar Bosko

**Estado**: `in-progress`  
**Fecha**: 2026-07-24  
**Padre**: [`refactor-ui-bosko.md`](./refactor-ui-bosko.md)  
**Design system**: [`docs/design/design.md`](../../../design/design.md) **§4.8**  
**Referencia de layout**: [`crud-table-ref.png`](../../../design/reference/crud-table-ref.png)

---

## Problema / Por qué

Carta hoy es una lista ad-hoc (`ink-*`, search suelto, sin vistas, sin columnas configurables).
Queremos el **primer CRUD** alineado al estándar §4.8 (toolbar + tabla densa + pills + ⚙ columnas +
delete `ConfirmRail`), adaptando la referencia de order-management a tokens Bosko — no al azul del mock.

---

## Objetivo

1. Rediseñar **toda** la página Carta (`CartaSection` + tabla + form) según §4.8.
2. Dejar el estándar reusable en `design.md` (ya) para Staff/PDV después.
3. UI sin `description` ni `vibe` (sacarlos del form y de la tabla). El tipo/API puede seguir aceptándolos; no migrar DB en esta fase.
4. Sin cambiar endpoints de drinks ni el resto del modelo operativo (`available`, `promo`, `trending`, precio, etc.).

---

## Decisiones de producto (cerradas)

| Tema | Decisión | Por qué |
|---|---|---|
| Acento del mock (azul) | **Esmeralda Bosko** (`--accent-*`) | Design system; no tercera paleta. |
| Segmented | **Todos · En carta · Ocultos** | Mapea `available`; sustituye OPEN/CLOSED del mock. |
| Funnel | Toggle fila de filtros; **default off** | Densidad limpia; filtros on-demand. |
| Search “campo” (Order ID ▾) | **Omitir** en Carta | Search = nombre. |
| ⚙ columnas | Sí; popover + `localStorage` `crud:carta:cols` | Pedido explícito. |
| Columnas default ON | Nombre (+icono), Precio, Estado, **Promo**, **Trending**, Acciones | Flags = **dos columnas** (mejor para sort/filter y ⚙). |
| Columnas opcionales (off por default) | **ID** | Útil para soporte; no ensucia el default. |
| Descripción / Vibe | **Fuera por completo** de UI Carta (tabla, filtros, form) | Producto: no se usan; no columnas ni campos. |
| Acciones | **Ojo** + **ConfirmRail** delete | Kebab YAGNI. |
| Edit | Click fila → drawer | Como hoy. |
| Delete | ConfirmRail + toast Deshacer 5s | §4.8. |
| Filtro precio | **Min / max** (dos inputs numéricos en la fila filtro) | Más útil que contains. |
| Contador subtítulo | **Filas visibles** tras vista + search + filtros de columna | “N tragos” = lo que ves en la tabla. |
| Paginación | **No** en Carta | Una carta típica es corta; paginar suma chrome sin valor. El contador “filas visibles” **no** es paginación. Si Staff/PDV crecen a cientos, paginar ahí. |
| DataTable lib | **No** | CSS grid/flex. |

---

## Mapeo mock → Carta

| Mock | Carta Bosko |
|---|---|
| OPEN / CLOSED ORDERS | Todos / En carta / Ocultos |
| Filter funnel | Igual — muestra/oculta fila filtros |
| Look Up by… + Order ID ▾ | Search por nombre (sin ▾ campo) |
| + NEW ORDER | + Nuevo Trago (primary accent) |
| STATUS pills | Estado: En carta (`success`) / Oculto (neutral) |
| Flags | Columnas **Promo** y **Trending** (pill o “—” si false) |
| ⚙ | Columnas visibles (ID opcional; Promo/Trending se pueden ocultar) |
| Row `⋯` | No; Eye + Trash/`ConfirmRail` |
| Paginación del mock (si hubiera) | Omitida |

---

## Historias de usuario

- Como **admin**, quiero ver la carta en una tabla clara (light/dark) con estado, promo y trending visibles.
- Como **admin**, quiero filtrar En carta vs Ocultos, buscar por nombre y acotar precio con min/max.
- Como **admin**, quiero mostrar u ocultar columnas (p. ej. ID, Promo, Trending) y que se recuerde.
- Como **admin**, quiero crear/editar sin vibe/descripción, y borrar con confirmación inline + Deshacer.

---

## Criterios de aceptación

### Shell de página

1. **Given** Carta, **then** título “Carta” + subtítulo con **conteo = filas actuales de la tabla** (post filtros), tokens `--text-primary` / `--text-secondary`, tipografía como Pagos/Logs (`font-bold` 28–32, sin badge de icono).
2. **Given** light y dark, **then** card `--bg-surface`, borde `--border-subtle`, radius 16–20; sin azul del mock.

### Toolbar

3. **Given** segmented **Todos | En carta | Ocultos**, **then** el activo usa acento Bosko.
4. **Given** “En carta” / “Ocultos”, **then** filtra por `available`; Todos = sin ese filtro.
5. **Given** funnel on/off, **then** muestra/oculta la fila de filtros bajo el header (default off).
6. **Given** search, **then** filtra por nombre (case-insensitive).
7. **Given** “+ Nuevo Trago”, **then** abre drawer create.

### Tabla + columnas

8. **Given** default, **then** visibles: Nombre, Precio, Estado, Promo, Trending, Acciones.
9. **Given** ⚙, **then** puedo toggle **ID**, Promo, Trending (y otras no-obligatorias si se agregan); **no** ocultar Nombre ni Acciones. Precio y Estado: toggleables OK (default on).
10. **Given** cambio de columnas, **then** persiste en `localStorage` `crud:carta:cols`.
11. **Given** header, **then** Nombre y Precio sorteables; activa con acento. Promo/Trending/Estado: sort opcional (nice-to-have; no bloqueante).
12. **Given** Estado, **then** pill En carta / Oculto.
13. **Given** Promo / Trending, **then** cada una es columna propia: pill si true, vacío o “—” si false.
14. **Given** la UI, **then** no hay columna ni texto de descripción ni vibe.

### Filtros de columna (funnel on)

15. **Given** funnel on, **then**: Nombre = contains; Precio = **min** y **max** (vacío = sin tope); Estado = select Todos/En carta/Ocultos (AND con segmented); Promo = Todos/Sí/No; Trending = Todos/Sí/No; ID (si visible) = contains exact/partial numérico.
16. **Given** funnel off, **then** **limpiar** filtros de columna al cerrar (opción simple).

### Filas + acciones + form

17. **Given** click fila (fuera de acciones), **then** drawer edit.
18. **Given** Eye, **then** toggle `available` sin abrir drawer.
19. **Given** ConfirmRail delete + Deshacer, **then** mismo contrato §4.8 / impl actual.
20. **Given** drawer, **then** Bosko tokens; campos: nombre, precio, icono/imagen, available, promo, trending (y lo operativo que ya exista **excepto** description/vibe). Al guardar, puede mandar `description: ""` / `vibe: ""` / `flavors: []` si el API aún los exige.
21. **Given** empty / error carga, **then** empty state + Reintentar.
22. **Given** la página, **then** **no** hay controles de paginación.

### Shared / docs

23. **Given** implementación, **then** no hay lib de tablas.
24. **Given** fin de fase, **then** §4.8 sigue alineado (sin contradecir tokens).

---

## Fuera de alcance

- Soft-delete en API / DB.
- Drop de columnas `description` / `vibe` / `flavors` en DB o shared types (solo UI; cleanup schema después si se quiere).
- Reorder de columnas.
- Paginación (Carta).
- Export CSV/PDF.
- Aplicar el mismo CRUD a Staff/PDV (specs hijas; ahí sí evaluar paginación si la lista es larga).

---

## Plan técnico (borrador — al aprobar)

| Área | Notas |
|---|---|
| Archivos | `CartaSection`, `DrinksTable`, `DrinkFormModal`; shared mínimo solo si se duplica JSX. |
| Estado | `viewFilter`, `filtersOpen`, col visibility, search, priceMin/Max, sort, delete undo. |
| Persistencia | `localStorage` column ids. |
| Form | Quitar inputs description/vibe (y UI de flavors si solo existía atada a vibe). |
| Tests | Segmented, min/max, column picker, form sin vibe/desc, ConfirmRail+undo. |

---

## Tareas (al pasar a `approved`)

- [ ] Aprobar esta spec
- [ ] Implementar toolbar + tabla §4.8 en Carta
- [ ] Column picker + localStorage
- [ ] Quitar description/vibe del form
- [ ] Restyle drawer a tokens Bosko
- [ ] Tests verdes
- [ ] Spec → `done` + nota en overview Bosko Fase 3

---

## Aclaración (paginación vs contador)

> “Filas visibles filtradas” = el número del subtítulo (“12 tragos”) refleja lo que pasó por segmented + search + filtros, **no** botones Página 1/2/3.
>
> Paginación queda **fuera** de Carta a propósito. Si más adelante una entidad CRUD supera ~100 filas cómodas, se agrega en esa spec (Staff/PDV), no acá.
