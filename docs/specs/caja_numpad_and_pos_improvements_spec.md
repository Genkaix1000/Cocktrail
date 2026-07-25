# Specification SDD & TDD: Mejoras en Sección Caja / POS (Tablet Friendly, Numpad, Cortesía, Split, Carta Rápida, Swipe-to-Delete y Performance)

**Estado:** Draft / En Revisión  
**Fecha:** 2026-07-25  
**Módulo:** `apps/web/src/components/caja` & `apps/api/src/modules/orders`  
**Referencia de Diseño Obligatoria:** [Bosko UI Design System](docs/design/design.md)

---

## 0. Plan de Implementación por Fases

| Fase | Componentes | Dependencias |
|---|---|---|
| **F1 — ProductsGrid / Carta** | Tap directo +1, badge cantidad (top-right), botón `-` (top-left) | Ninguna |
| **F2 — Custom Numpad** | Grid 0-9, Backspace, Clear, display con formateo `$` y miles, `inputmode="none"`, shortcuts | Ninguna |
| **F3 — PaymentSection: Split + Cortesía** | Split Efectivo+QR (cálculo automático, validaciones, botón deshabilitado). Cortesía/Regalo (`$0`, descuento stock, tracking auditoría + KPIs) | F2 (Numpad) |
| **F4 — OrderSummary: Swipe-to-Delete + Gift Button** | Swipe izquierda para eliminar, Toast "Deshacer" top-center, gift icon button (izquierda del botón borrar), borrar rojo circular más grande | Ninguna (paralelizable con F3) |
| **F5 — Performance Polish** | `React.memo` + `useCallback` en toda la sección Caja, scrollbar personalizado, verificar con React DevTools Profiler | F1, F2, F3, F4 |

---

## 1. Resumen Ejecutivo (Executive Summary)

Rediseño funcional y técnico de la **Sección Caja / POS** de Cocktrail, optimizada para tablets de barra con atención rápida al cliente.

### Objetivos Principales:
1. **Numpad Personalizado:** Reemplazar el teclado nativo del SO por un teclado numérico táctil custom.
2. **Cobro por Cortesía / Regalo:** Ticket a $0 con tracking en auditoría y KPIs. Botón de regalo en el header de "Pedido Actual".
3. **Pago Dividido (Split Payment):** Dividir transacción entre Efectivo y QR con cálculo automático del remanente.
4. **Carta Rápida:** Tap directo agrega +1, badge de cantidad, botón `-` para decrementar.
5. **Swipe-to-Delete con Undo Toast:** Deslizar a la izquierda para eliminar ítems, notificación superior central "Deshacer".
6. **Optimización Visual y Rendimiento:** Sin animaciones pesadas, 60 FPS en cualquier dispositivo. Scrollbar personalizado Bosko.

---

## 2. Alineación con el Design System (Bosko UI Tokens & Specs)

Todos los componentes deben regirse por los tokens de [docs/design/design.md](docs/design/design.md):

* **Superficies:**
  - Panel principal / Canvas de la Caja: `--bg-panel`
  - Tarjetas de tragos y resumen de pedido: `--bg-surface` (`#FFFFFF` en Light / `#22262C` en Dark)
  - Numpad Display y contenedores numéricos: `--bg-input` / `--bg-surface-elevated`
* **Bordes y Radius:**
  - Contenedor de la sección: `24px` (`rounded-3xl`)
  - Tarjetas de productos y panel de pedido: `16px`–`20px` (`rounded-2xl`)
  - Botones del Numpad y controles: `8px`–`12px` (semi-pill / `rounded-xl`)
* **Colores de Acento y Estados:**
  - Acento Principal (`[ Pedido Concretado ]`): `--accent-primary` (`#155339` en Light / `#10B981` en Dark)
  - Botón de Borrar / Limpiar Pedido: `--badge-danger-bg` (`#FEE2E2` / `#451212`) con icono/texto `--badge-danger-text` (`#991B1B` / `#FECACA`). Forma circular, tamaño mayor al estándar.
  - Badge de Cortesía / Regalo: `--accent-surface` (`#E6F4ED` / `#0F382C`) con icono de regalo y texto `--accent-text`.
  - Badge de cantidad en ProductsGrid: `--accent-primary` / `--accent-surface`.
* **Scrollbar Personalizado:**
  - Aplicar las clases CSS globales del sistema para scrollbar fino (`scrollbar-thin`, `scrollbar-thumb-[var(--border-strong)]`, `scrollbar-track-transparent`).

---

## 3. Software Design Document (SDD)

### 3.1 Arquitectura de Componentes (Frontend UI)

```
[ CajaView / POS Container ]
 ├── [ ProductsGrid / Carta ]
 │    ├── Tap directo (+1)
 │    ├── Quantity Badge (Top Right, Circle Accent)
 │    └── Quick Decrement (-) Button (Top Left, Subtle Border)
 │
 ├── [ OrderSummary / Pedido Actual ]
 │    ├── Header
 │    │    ├── [ Gift Icon Button ] (Left — Cortesía)
 │    │    └── [ Clear Button ] (Right — Rojo, Circular, Grande)
 │    ├── Item List (Swipe-to-Delete enabled — izquierda)
 │    └── Custom Bosko Scrollbar
 │
 ├── [ PaymentSection / Checkout Panel ]
 │    ├── Custom Numpad Component
 │    │    ├── Display (Big Amount — inputmode="none", formateado $ + miles)
 │    │    ├── Grid (0-9 + Backspace + Clear)
 │    │    └── Shortcut: [ Recibí Monto Exacto ] (small, above main button)
 │    ├── Split Payment Interface (Efectivo + QR)
 │    ├── Cortesía / Regalo toggle
 │    └── Action Button: [ Pedido Concretado ] (Full-width, Primary Accent)
 │
 └── [ TopCenterToastProvider ]
      └── Undo Toast Notification (Z-Index top, Non-blocking, Bosko Toast Spec)
```

### 3.2 Requerimientos Funcionales y de Interfaz

#### A. Custom Numpad y Flujo de Cobro

- **Display:** Input prominente con tipografía `tabular-nums` que no desencadena el teclado virtual de la tablet mediante `inputmode="none"` (se actualiza programáticamente desde el Numpad). El valor se formatea automáticamente con separador de miles y prefijo `$` (ej. `$1,500`). Solo enteros (sin decimales).
- **Grid:** 9 botones numéricos (1-9), 0 centrado abajo, Backspace (borrar último dígito), Clear (limpiar todo).
- **Shortcut `[ Recibí Monto Exacto ]`:** Botón pequeño sobre el botón principal. Autocompleta el monto recibido con el total del carrito.
- **Botón principal `[ Pedido Concretado ]`:** Full-width, `--accent-primary`, debajo del shortcut. Procesa la orden.
- **Validación del botón:** Se deshabilita (gris, `opacity-50`, `cursor-not-allowed`) si el monto es `0`, está vacío o supera el total del pedido.

#### B. Pagos Divididos (Split Payment)

- **Métodos:** Exclusivamente 2: **Efectivo** y **QR (Mercado Pago)**.
- **Cálculo Dinámico:**
  - Al ingresar `Monto Efectivo` se calcula automáticamente el remanente en `QR`.
  - `[ Pedido Concretado ]` deshabilitado si la suma de ambos métodos no coincide exactamente con el total.
  - Si el monto de Efectivo supera el total, el botón se deshabilita.
- **Payload API:**
  ```json
  {
    "orderId": "ord_123",
    "total": 20000,
    "isSplit": true,
    "payments": [
      { "method": "CASH", "amount": 13000 },
      { "method": "MERCADOPAGO", "amount": 7000 }
    ]
  }
  ```

#### C. Cortesía / Regalo

- **Ubicación:** Botón con icono de regalo en el **header de "Pedido Actual"**, a la izquierda del botón de borrar.
- **Comportamiento:**
  - Al presionarlo, todos los ítems en "Pedido Actual" se procesan como "Pagado" pero sin impacto monetario.
  - Total forzado a `$0`. La orden se registra con flag `isGift: true`.
  - Descuenta stock del inventario. No suma ingresos a la caja.
  - Cualquier usuario de caja puede otorgar cortesías (sin permisos especiales).
- **Header visual:**
  - Botón de regalo a la izquierda, sutil, con icono de regalo y colores `--accent-surface`.
  - Botón de borrar a la derecha, rojo (`--badge-danger-bg`/`--badge-danger-text`), circular, ligeramente más grande que el estándar, con icono de papelera.
- **KPIs y Auditoría:**
  - **Auditoría de Tickets:** Etiqueta *"Cortesía / Regalo"* visible, con detalle del usuario/cajero que lo otorgó.
  - **Dashboard KPIs:** Nueva sección *"Cortesías Otorgadas"* — cantidad de tragos regalados y valor estimado no percibido.

#### D. Rediseño de la Grilla de Productos / Carta

- **Eliminación de expansión:** Tap directo sobre la tarjeta agrega +1 unidad al pedido instantáneamente (sin modal, sin menú colapsable).
- **Badge de cantidad:** Arriba a la derecha, círculo con `--accent-primary`, muestra el número de unidades en el carrito. Solo visible si cantidad > 0.
- **Botón `-`:** Arriba a la izquierda, circular sutil con borde. Visible solo si cantidad > 0. Decrementa 1 unidad.
- **No hay botón `+`** porque el tap directo ya agrega.

#### E. Pedido Actual & Swipe-to-Delete

- **Header:**
  - Izquierda: icono de regalo (Cortesía).
  - Derecha: botón circular rojo `[ Limpiar Pedido ]`, tamaño mayor al estándar, con icono de papelera (`--badge-danger-bg`/`--badge-danger-text`).
- **Gestos Touch:** Swipe horizontal **a la izquierda** para eliminar un ítem del pedido. En desktop (debug), se puede emular con drag del mouse.
- **Notificación Undo (Deshacer):**
  - Ubicación: **Superior Central** de la pantalla para no obstruir el Numpad ni la zona de cobro.
  - Basado en la especificación `Toast (+ action)` de `docs/design/design.md`.
  - Al presionar "Deshacer", el ítem eliminado se restaura con su cantidad original.

#### F. Scrollbar y Performance

- **Scrollbar:** Estilo personalizado idéntico al Dashboard de Admin (`scrollbar-thin`).
- **Rendimiento:** Toda la sección Caja debe evitar re-renders masivos:
  - El Numpad no debe causar re-renders en `ProductsGrid` ni `OrderSummary`.
  - Usar `React.memo` y `useCallback` en componentes de carta y pedido para aislar actualizaciones.
  - Verificar con React DevTools Profiler que no haya re-renders innecesarios al presionar teclas del Numpad.
  - Sin animaciones pesadas ni transiciones complejas que degraden experiencia en tablets de gama media.

---

## 4. Test-Driven Development (TDD) Plan

### 4.1 Pruebas Unitarias (Frontend — Jest / React Testing Library)

#### `Numpad.test.tsx`
- [ ] Debe concatenar números correctamente al hacer tap en las teclas.
- [ ] Debe borrar el último dígito al presionar Backspace.
- [ ] Debe limpiar el valor al presionar Clear.
- [ ] Debe establecer el monto exacto del total al presionar `[ Recibí Monto Exacto ]`.
- [ ] No debe abrir el teclado nativo (input con `inputmode="none"`).
- [ ] Debe deshabilitar `[ Pedido Concretado ]` si el monto es 0, está vacío o supera el total.
- [ ] Debe formatear el monto con separador de miles y signo `$`.

#### `SplitPayment.test.tsx`
- [ ] Debe calcular el remanente de QR automáticamente al modificar el monto de Efectivo.
- [ ] Debe deshabilitar `[ Pedido Concretado ]` si la suma de ambos métodos no coincide exactamente con el total.
- [ ] Debe deshabilitar `[ Pedido Concretado ]` si el monto de Efectivo supera el total.

#### `ProductCard.test.tsx`
- [ ] Debe incrementar la cantidad al hacer tap en la tarjeta (sin modales ni colapsables).
- [ ] Debe mostrar el badge con el número de ítems seleccionados si cantidad > 0.
- [ ] Debe decrementar 1 unidad al hacer tap en el botón `-`.
- [ ] No debe mostrar el badge ni el botón `-` si cantidad === 0.

#### `OrderSummary.test.tsx`
- [ ] Debe disparar la acción de eliminar e invocar el Toast en posición `top-center` al swipetar a la izquierda.
- [ ] Debe restaurar el producto al presionar "Deshacer" en el Toast.
- [ ] Debe limpiar todo el pedido al presionar el botón rojo de limpiar.

#### `GiftButton.test.tsx`
- [ ] Debe procesar todos los ítems como pagados sin impacto monetario al presionar el icono de regalo.
- [ ] Debe registrar la orden con `isGift: true`.

### 4.2 Pruebas Unitarias e Integración (Backend — NestJS / Supabase)

#### `orders.service.spec.ts`
- [ ] **Cobro de Cortesía:** Debe procesar la orden con monto $0, registrar `isGift: true` y descontar insumos del inventario sin alterar ingresos brutos.
- [ ] **Pago Dividido:** Debe guardar correctamente el arreglo de pagos (`CASH` + `MERCADOPAGO`) vinculados a una misma transacción.
- [ ] **Métricas / KPIs:** La consulta de totales debe contabilizar por separado dinero recaudado y cortesías otorgadas.

---

## 5. Plan de Verificación Manual (QA Plan)

1. **Prueba en Tablet Táctil:**
   - Interactuar con el Numpad en una tablet (iPad / Android Tab) y verificar que nunca aparezca el teclado nativo del SO.
2. **Prueba de Pago Dividido:**
   - Realizar una compra de $5.000, seleccionar Split, ingresar $2.000 en Efectivo y verificar que $3.000 se asignen a QR.
3. **Prueba de Cortesía:**
   - Presionar el icono de regalo, emitir ticket, verificar que en Auditoría figure "Cortesía" y en KPIs sume +1 regalo.
4. **Prueba de Gestos en Pedido:**
   - En tablet: deslizar ítem a la izquierda, verificar que desaparezca, aparezca Toast superior, al presionar "Deshacer" vuelva el ítem.
   - En desktop (debug): arrastrar (drag) el ítem con el mouse, mismo comportamiento.
5. **Prueba de Carta Rápida:**
   - Tocar una tarjeta de trago, verificar que se agregue +1 sin expandir nada. Verificar badge y botón `-`.
6. **Prueba de Performance:**
   - Navegar la sección Caja en una tablet de gama media. Verificar que no haya lag, tirones ni re-renders visibles al operar el Numpad.
