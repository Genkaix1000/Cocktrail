# Specification SDD & TDD: Mejoras en Sección Caja / POS (Tablet Friendly, Numpad, Cortesía, Pago Dividido y UI Performance)

**Estado:** En Progreso (F1 y F2 Completadas)  
**Fecha:** 2026-07-25  
**Módulo:** `apps/web/src/components/caja` & `apps/api/src/modules/orders`  
**Referencia de Diseño Obligatoria:** [Bosko UI Design System](docs/design/design.md)

---

## 0. Plan de Implementación por Fases

| Fase | Componentes | Estado |
|---|---|---|
| **F1 — ProductsGrid / Carta** | Tap directo +1, badge cantidad en esquina superior derecha, botón `-` discreto en esquina superior izquierda | **COMPLETADO** |
| **F2 — Custom Numpad** | Fila `Total | Exacto`, displays `Recibido | Vuelto/Faltan` con estado activo, grid 3x4 Numpad Bosko (`1-9`, `C`, `0`, `⌫`), `inputmode="none"` | **COMPLETADO** |
| **F3 — PaymentSection: Split + Cortesía** | Split Efectivo+QR (cálculo automático, validaciones, botón deshabilitado), Cortesía/Regalo (`$0`, `isGift`, descuento stock) | **EN PROGRESO** |
| **F4 — OrderSummary: Swipe-to-Delete** | Swipe/drag para eliminar ítems, Toast superior "Deshacer" | Pendiente |
| **F5 — Performance Polish** | `React.memo` + `useCallback` en toda la sección Caja, scrollbar personalizado | Pendiente |

---

## 1. Resumen Ejecutivo (Executive Summary)

Esta especificación describe el rediseño funcional y técnico de la **Sección Caja / Punto de Venta (POS)** de Cocktrail, orientada a optimizar el rendimiento en tablets de barra y agilizar la atención rápida al cliente.

---

## 2. Alineación con el Design System (Bosko UI Tokens & Specs)

Todos los componentes nuevos o refactorizados en la Caja se rigen estrictamente por [docs/design/design.md](docs/design/design.md):

* **Superficies:** `--bg-panel`, `--bg-surface`, `--accent-surface`, `--success-soft`, `--danger-soft`.
* **Bordes y Radius:** `rounded-full` para pills de Total/Exacto y botones principales; `rounded-2xl` para displays y Numpad keys.
* **Colores de Acento y Estados:**
  - Acento Principal (`[ Cobrar / Pedido Concretado ]`): `--accent-primary`
  - Vuelto positivo: `--success`
  - Saldo faltante: `--danger`

---

## 3. Software Design Document (SDD)

### 3.1 Numpad y Flujo de Cobro en Efectivo (F2 Layout Aprobado)
- **Fila Superior:**
  - Pill `Total`: Muestra `$totalPrice` con tipografía de alto peso.
  - Button `Exacto` (`Zap` icon + `E` shortcut): Autocompleta el monto recibido con el total exacto.
- **Fila de Displays (Recibido | Vuelto / Faltan):**
  - `Recibido`: Muestra `$displayCashValue` en verde acento elevado.
  - `Vuelto / Faltan`: Calcula la diferencia en tiempo real. Muestra en rojo `"Faltan $X"` si el monto es insuficiente y verde `"Vuelto $X"` si el cobro se puede concretar.
- **Numpad Grid 3x4:** Teclas táctiles neumórficas/Bosko sin despliegue de teclado nativo (`inputmode="none"`).

---

### 3.2 Fase 3: Pagos Divididos (Split Payment) & Cortesía / Regalo

#### A. Pagos Divididos (Split Payment: Efectivo + QR)
- **Métodos:** Exclusivamente 2 métodos combinados: **Efectivo** y **QR (Mercado Pago)**.
- **Cálculo Dinámico:**
  - Al ingresar `Monto Efectivo` (ej. $13.000 sobre un total de $20.000), se calcula y muestra automáticamente el remanente en `QR` (ej. $7.000).
  - El botón `[Confirmar Cobro]` se deshabilita si la suma de ambos métodos no coincide exactamente con el total del pedido.
- **Payload API:**
  ```json
  {
    "total": 20000,
    "isSplit": true,
    "payments": [
      { "method": "CASH", "amount": 13000 },
      { "method": "MERCADOPAGO", "amount": 7000 }
    ]
  }
  ```

#### B. Cortesía / Regalo ($0)
- **Ubicación:** Botón/opción `[ Cortesía / Regalo ]` en la grilla de selección de método de cobro (discreto).
- **Comportamiento:**
  - Total a cobrar se fuerza a `$0`.
  - La orden se registra con flag `isGift: true` / `paymentMethod: "GIFT"`.
  - No suma ingresos monetarios a la caja, pero descuenta stock del inventario.
- **Auditoría:** Etiqueta *"Cortesía / Regalo"* en el historial de tickets.

---

## 4. Plan TDD para F3

- [ ] `VentaSection.test.tsx`: Permite seleccionar la opción de Cortesía/Regalo y envía la orden a la API con monto $0 y método `GIFT`.
- [ ] `VentaSection.test.tsx`: En Pago Dividido, al ingresar $3.000 en Efectivo sobre una compra de $5.000, autocalcula $2.000 en QR.
- [ ] `orders.service.spec.ts`: El backend procesa correctamente pagos divididos y registros de regalo en auditoría.
