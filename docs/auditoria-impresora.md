# Auditoría de la Función de Impresora

Fecha: 2026-08-08 | Alcance: 55 archivos entre API, Web App, tests, documentación y specs.

---

## 1. Arquitectura General

### Principio rector

**Separación contenido ↔ representación física.** El server es dueño de QUÉ dice un ticket (`TicketContent`); el device de caja es dueño de CÓMO se imprime (ESC/POS texto por USB, raster 384px por Bluetooth). El server nunca toca hardware de impresión.

```
OrdersService (API)
  → PrinterService.buildTicketContent(order, event)  → TicketContent
  → PrinterService.buildTicketBytes(content)         → ESC/POS bytes (base64)
  → CreateOrderResult { ticketData, ticketContent }

HTTP response al cliente /caja:
  → usePrinterStatus().printTicket(result)
    → printerManager.print({ escposBase64, ticketContent })
      → selectTransport()
        → BLE-S1:  renderTicketBitmap() → raster 384px → buildS1Sequence() → GATT writes
        → WebUSB:  decodeBase64(escposBase64) → USB transferOut
        → Native:  window.MiBolichePrinter.print(base64)
```

### Capas

| Capa | Archivos | Rol |
|---|---|---|
| **API — Contenido** | `printer.service.ts`, `printer.controller.ts` | Arma `TicketContent`, genera ESC/POS bytes en CP437, expone endpoints `/status`, `/test`, `/reprint/:orderId` |
| **Shared Types** | `packages/shared/src/domain.ts` | `TicketContent`, `PrintPayload`, `CreateOrderResult` con `ticketData`/`ticketContent` |
| **Web — Transporte** | `lib/printing/` (8 archivos + 6 tests) | Manager, cola, selección de transporte, raster, protocolo S1, 3 transportes |
| **Web — Hook** | `hooks/usePrinterStatus.ts` | Adaptador React (`useSyncExternalStore`) del `printerManager` |
| **Web — API Client** | `services/printer.service.ts` | `test()` y `reprint(orderId)` |
| **Web — UI** | `Sidebar.tsx`, `VentaSection.tsx`, `HistorialSection.tsx` | Status chip, vincular/conectar, test print, auto-print, reprint |

### Transportes (prioridad fija en `select-transport.ts`)

1. **Native Bridge** (`native-bridge.ts`): `window.MiBolichePrinter` en el WebView del APK Android. No hay Web Bluetooth ni WebUSB en ese entorno.
2. **BLE S1** (`ble-s1.ts`): Web Bluetooth API. Impresora Lujiang S1 (comandera), protocolo propietario. Convierte `TicketContent` a raster monocromo 384px vía Canvas, lo empaqueta en secuencia de comandos S1, chunked a 20 bytes por defecto.
3. **WebUSB** (`webusb.ts`): Chrome WebUSB API. Ticketera térmica USB (NICTOM IT06), imprime ESC/POS texto directo.

---

## 2. Inventario Completo de Archivos

### API (server)

| Archivo | Líneas | Propósito |
|---|---|---|
| `apps/api/src/modules/printer/printer.service.ts` | 170 | `PrinterService`: genera `TicketContent` + ESC/POS bytes. CP437 encoding. Métodos: `buildTicketContent`, `buildTestContent`, `renderTicket`, `renderTicketPayload`, `renderTest`, `printTicket`, `printTest`, `getStatus`. |
| `apps/api/src/modules/printer/printer.controller.ts` | 51 | Rutas: `GET /status`, `POST /test`, `POST /reprint/:orderId`. Auth `admin`/`caja`. Validación: no reimprime pedidos `pendiente_de_cobro`. |
| `apps/api/src/app.ts` (L116, L226, L351) | — | Instancia `PrinterService`, inyecta `renderTicketPayload` en `OrdersService`, monta controller en `/api/printer`. |
| `apps/api/src/modules/orders/orders.service.ts` (L30, L174-195) | — | Invoca `renderTicketPayload` al crear orden de staff con pago resuelto. Fail-open: si el render falla, la venta no se cae. |
| `apps/api/src/modules/system/system.service.ts` (L6, L39, L54, L178) | — | Incluye `printer.getStatus()` en `GET /api/system/status`. |

### Shared Types

| Archivo | Definiciones |
|---|---|
| `packages/shared/src/domain.ts` (L132-165) | `TicketContent` (nightDateText, brand, saleText, dateText, items, keywordText), `PrintPayload` (success, message, data base64, ticketContent), `CreateOrderResult.printed`/`ticketData`/`ticketContent`. |

### Web App — Librería de impresión (`lib/printing/`)

| Archivo | Líneas | Propósito |
|---|---|---|
| `types.ts` | 42 | `PrinterTransport` (interfaz: `pair`, `print`, `isConnected`, `isAvailable`, `connect?`), `TransportId`, `PrinterSnapshot`, `PrinterPhase`, `TransportPrintPayload`. |
| `manager.ts` | 211 | `PrinterManager` (singleton): coordina transporte, cola, snapshot inmutable. `refresh`, `pair`, `connect`, `print`. Framework-agnóstico. |
| `queue.ts` | 105 | `PrintQueue` FIFO (máx 10), serializado. Fallo en cascada: descarta pendientes y reporta cuántos tickets se perdieron. |
| `raster.ts` | 250 | Render de `TicketContent` a bitmap monocromo 384px vía Canvas 2D. `buildTicketLines`, `wrapLine`, `packMonochrome`, `computeTicketHeight`, `renderTicketBitmap`, `downsampleRowPairs`. Calibrado contra hardware real (gate T1). |
| `s1-protocol.ts` | 165 | Secuencia propietaria S1: ENABLE → wake → densidad → imagen (GS v 0, chunked) → relleno de largo mínimo → feed → STOP. Delays calibrados. |
| `select-transport.ts` | 23 | Política de selección: native > BLE S1 (paired) > WebUSB. |
| `transports/ble-s1.ts` | 232 | Transporte Web Bluetooth S1. Pairing, reconexión con doble intento, cache de device/GATT, serialización de `gatt.connect()`. |
| `transports/webusb.ts` | 103 | Transporte WebUSB. `requestDevice`, `getDevices`, `claimInterface`, `transferOut`. |
| `transports/native-bridge.ts` | 52 | Transporte puente nativo Android: delega a `window.MiBolichePrinter`. |

### Web App — Hook, Service, UI

| Archivo | Líneas | Propósito |
|---|---|---|
| `hooks/usePrinterStatus.ts` | 145 | Adaptador React: `useSyncExternalStore` sobre `printerManager`. Expone `printerStatus`, `pairPrinterDevice`, `connectPrinter`, `printTicket`, `testPrint`, `reprintTicket`, `printError`, `reprinting`. Auto-refresh cada 30s. |
| `services/printer.service.ts` | 14 | API client: `test()` (POST `/api/printer/test`), `reprint(orderId)` (POST `/api/printer/reprint/:orderId`). |
| `components/caja/Sidebar.tsx` | 403 | UI de impresora: chip de estado con icono `Printer`, botón "Vincular impresora", botón "Conectar" (BLE wakeup), test print. |
| `components/caja/VentaSection.tsx` | — | Auto-print post-pago. Botón de reimpresión en pantalla de éxito. |
| `components/caja/HistorialSection.tsx` | — | Botón "Reimprimir Ticket" por orden, con estados de carga/error. |
| `hooks/useCheckout.ts` | — | Callback `printTicket` en el flujo de checkout. |

### Tests

| Archivo | Propósito |
|---|---|
| `apps/api/.../orders.service.test.ts` | Verifica que órdenes de staff producen `ticketData`/`ticketContent`. |
| `apps/api/.../system.service.test.ts` | Verifica que `system.status` incluye estado de impresora. |
| `apps/api/.../test-night-flow.test.ts` | Usa `PrinterService` en flujo integrado de noche de prueba. |
| `apps/web/.../manager.test.ts` | `PrinterManager`: transporte, pairing, connect, print, integración con cola. |
| `apps/web/.../queue.test.ts` | `PrintQueue`: FIFO, cascada, límite de pending. |
| `apps/web/.../raster.test.ts` | `buildTicketLines`, `wrapLine`, `packMonochrome`, `computeTicketHeight`, `downsampleRowPairs`. |
| `apps/web/.../s1-protocol.test.ts` | `buildS1Sequence`: secuencias de bytes del protocolo. |
| `apps/web/.../select-transport.test.ts` | Política de selección de transporte. |
| `apps/web/.../ble-s1.test.ts` | Transporte BLE S1. |
| `apps/web/.../usePrinterStatus.test.ts` | Snapshot, printTicket, ticket incompleto, reprint. |
| `apps/web/.../printer.service.test.ts` | Llamadas a la API de printer. |
| `apps/web/.../caja/page.test.tsx` | Page-level test. |
| `apps/web/.../Sidebar.test.tsx` | UI de impresora: estado conectado, botón vincular, mensaje de test. |
| `apps/web/.../VentaSection.test.tsx` | Todas las pruebas usan mock de `printer`. |
| `apps/web/.../HistorialSection.test.tsx` | Botón de reimpresión y mensajes de error. |
| `apps/web/.../useCheckout.test.ts` | Checkout con callback `printTicket`. |

### Documentación

| Archivo | Contenido |
|---|---|
| `docs/specs/01-tickets-impresora/impresora-termica.md` | Spec original: USB térmica NICTOM IT06, ESC/POS texto, auto-print, reprint, "SIN VALOR". |
| `docs/specs/impresion-bluetooth-comandera.md` | Spec Bluetooth: 14 tareas (T1-T14), diseño de transportes, raster pipeline, protocolo S1. |
| `docs/ARCHITECTURE.md` (L83, L127-128) | Diagrama de arquitectura: módulo printer, split contenido/físico. |
| `docs/ROADMAP.md` | Bluetooth printing done. Riesgo "no paper sensor". Reemplazo Goojprt MPT-II. |
| `docs/DEPLOY.md` (L116) | "Caja + impresora térmica (app Android)". |
| `docs/evaluacion-cloud-vs-local-comandera.md` | Impresora es el único hard blocker para cloud. |
| `docs/specs/noches-de-prueba-y-borrado.md` | Ticket de prueba: watermark "PRUEBA", reprint desde orders repo. |
| `docs/specs/deploy-cloud-comandera.md` | Referencias a impresora en deploy cloud. |

### Archivo eliminado

- `apps/web/src/lib/webusb-printer.ts` — Eliminado en T9 (Bluetooth spec). Su lógica migró a `PrinterTransport` y los 3 transportes.

---

## 3. Auditoría de Código Muerto

### 3.1 `renderTicket` — `printer.service.ts:135`

```ts
renderTicket(order: Order, nightEvent: NightEvent): string {
  return this.buildTicketBytes(this.buildTicketContent(order, nightEvent)).toString("base64");
}
```

**Estado**: Método público, definido, **nunca invocado**. Solo aparece en un comentario de test (`tickets.integration.test.ts:24`). El método usado en producción es `renderTicketPayload`, que devuelve `{ ticketData, ticketContent }`.

**Acción**: Eliminar.

---

### 3.2 `downsampleRowPairs` — `raster.ts:175`

```ts
export function downsampleRowPairs(bitmap: TicketBitmap): TicketBitmap { ... }
```

**Estado**: Exportada, bien testeada (3 casos en tests), **cero llamadas fuera de tests**. El modo `doubleHeight` (m=0x02) fue abandonado porque rompía tickets de más de un trago — el firmware esperaba el doble de bytes y se desincronizaba. Ver `s1-protocol.ts:23-27` y `ble-s1.ts:213-215`.

**Acción**: Eliminar función + sus tests + el variant `"doubleHeight"` del tipo `S1Mode`. Si se necesita en el futuro se reimplementa — es matemática de pixeles, no lógica de negocio.

---

### 3.3 `S1Mode["doubleHeight"]` y parámetro `mode` — `s1-protocol.ts`

El tipo `S1Mode` solo se usa internamente. Ningún caller externo pasa `mode`. El default es `"normal"` (m=0x00). El path `doubleHeight` nunca se ejecuta.

**Acción**: Eliminar el parámetro `mode`, el tipo `S1Mode`, y hardcodear `const m = 0x00`. Simplificar `MIN_TICKET_DOTS - printedDots` → `MIN_TICKET_DOTS - height` (con m=0x00, `printedDots` siempre es `height`).

---

### 3.4 `buildTestBytes` — `printer.service.ts:123`

Método privado que duplica la lógica de `buildTicketBytes`. La cadena es:
- `buildTestContent()` → `TicketContent`
- `buildTestBytes()` → `Buffer` (construido a mano)
- `renderTest()` → base64

Mientras que `buildTicketBytes(this.buildTestContent())` hace exactamente lo mismo.

**Acción**: Eliminar `buildTestBytes`. Cambiar `renderTest()` a:
```ts
return this.buildTicketBytes(this.buildTestContent()).toString("base64");
```

---

### 3.5 Loop de franjas con `STRIPE_MAX_ROWS = 0xFFFF` — `s1-protocol.ts:28,131-150`

```ts
const STRIPE_MAX_ROWS = 0xffff; // 65535 filas = ~8.2 metros de papel
for (let y0 = 0; y0 < height; y0 += STRIPE_MAX_ROWS) {
  const rows = Math.min(STRIPE_MAX_ROWS, height - y0);
  // ... header + body, chunked
}
```

El ticket más largo (~35mm = ~280 filas a 203dpi) ni se acerca a 65535. El loop siempre ejecuta **exactamente una iteración**.

**Acción**: Desenrollar el loop. Usar `height` y `data` directamente. Si alguna vez se necesita soportar tickets de >8 metros, se agrega el loop.

---

### 3.6 `MIN_TICKET_DOTS` exportado — `s1-protocol.ts:44`

Exportado pero solo usado internamente y verificado en test. Ningún consumidor externo.

**Acción**: Dejar de exportar. Es detalle interno del protocolo.

---

### 3.7 `PrinterStatus.connected: false` fijo — `printer.service.ts:59-65`

```ts
getStatus(): PrinterStatus {
  return {
    connected: false,
    configured: true,
    message: "La impresora se vincula en el dispositivo de caja (WebUSB)",
  };
}
```

`connected` siempre `false`, `configured` siempre `true`, mensaje estático. El campo `connected` en el server es engañoso — el server no puede saber si hay impresora física conectada al device de caja.

**Acción**: Eliminar el campo `connected` del server-side status o renombrarlo. El verdadero estado de conexión lo reporta el `printerManager` del cliente.

---

## 4. Hallazgos de Optimización

### 4.1 Cola de impresión: cascada sin `AbortController`

`queue.ts:62-73`: cuando un job falla, descarta todos los pendientes. Correcto. Pero `droppedError` (línea 68) solo contiene el mensaje de cascada sin el error raíz. Los jobs dropeados reciben solo "N tickets sin imprimir", no la causa. Intencional (evita 15 errores de BLE repetidos), pero no está documentado.

### 4.2 `ble-s1.ts`: delays sin cancelación

`ble-s1.ts:175`: `const sleep = (ms) => new Promise(r => setTimeout(r, ms))`. Los delays del protocolo S1 suman ~3-5 segundos por ticket. Si la impresora se apaga a mitad del print, los delays siguen corriendo. Considerar un `AbortController` por job. Baja prioridad: el caso real es raro.

### 4.3 `raster.ts`: doble pasada `thick`

```ts
if (line.thick) {
  ctx.fillText(line.text, x + 1, y);
  ctx.fillText(line.text, x, y + 1);
}
```

Dibuja el texto 3 veces para engrosar trazos. Correcto y efectivo contra la S1 real (gate T1). Sin cambios necesarios.

### 4.4 `select-transport.ts`: seam comment no implementado

```ts
// Seam futuro: una preferencia explícita (ej. localStorage
// "cocktrail.printer-transport") se leería acá...
```

Comentario de "algún día". Si no está en el roadmap inmediato, eliminar.

### 4.5 `webusb.ts`: sin filtro de vendorId

```ts
await api.requestDevice({ filters: [] });
```

El filtro vacío muestra todas las impresoras USB. `ponytail:` cubre el caso de una sola ticketera, pero si hay varias se necesitaría filtrar por `vendorId`. El comentario ya lo anticipa.

---

## 5. Resumen de Recomendaciones

### Prioridad alta: código muerto a eliminar

| # | Qué | Archivo | Líneas a borrar |
|---|---|---|---|
| R1 | Eliminar `renderTicket` | `printer.service.ts:135-137` | -3 |
| R2 | Eliminar `downsampleRowPairs` + tests + `doubleHeight` de `S1Mode` | `raster.ts:175-187`, `raster.test.ts:135-163`, `s1-protocol.ts:79,109,112,127,157` | ~40 |
| R3 | Eliminar `buildTestBytes`, reusar `buildTicketBytes` | `printer.service.ts:123-132,149` | -10 |
| R4 | Desenrollar loop `STRIPE_MAX_ROWS` | `s1-protocol.ts:28,131-150` | -5 |
| R5 | Dejar de exportar `MIN_TICKET_DOTS` | `s1-protocol.ts:44` | `export` → `const` |

**Total estimado**: ~60 líneas menos, sin pérdida de funcionalidad.

### Prioridad baja: mejoras cosméticas

| # | Qué | Archivo |
|---|---|---|
| R6 | Eliminar o renombrar `PrinterStatus.connected: false` | `printer.service.ts:61` |
| R7 | Eliminar seam comment de localStorage | `select-transport.ts:17-18` |
| R8 | Documentar que los jobs dropeados no reciben el error raíz (es intencional) | `queue.ts:63-70` |

### Diseño

- La separación contenido ↔ representación física es correcta y resistió dos modelos de impresora distintos (USB térmica + BLE comandera).
- La interfaz `PrinterTransport` + 3 implementaciones es el patrón adecuado: no hay abstracción de más (Strategy sobre 3 concretos, sin factory).
- La cola secuencial es necesaria: BLE no tolera escrituras intercaladas.
- El singleton `printerManager` a nivel módulo (no clase con `getInstance()`) es la forma más simple y correcta en JS — el module system ya es el singleton.
- No hay dependencias externas de impresión: todo es stdlib + Web APIs. Correcto.

---

## 6. Diagrama de Flujo Completo

```
┌─────────────────────────────────────────────────────────────┐
│                        API (Server)                          │
│                                                              │
│  OrdersService.createOrder()                                 │
│    ├── payment resolved? ──→ PrinterService.renderTicketPayload()
│    │                           ├── buildTicketContent(order, event)
│    │                           │     → TicketContent
│    │                           └── buildTicketBytes(content)
│    │                                 → ESC/POS bytes (CP437)
│    │                                 → base64
│    └── CreateOrderResult { ..., ticketData, ticketContent }
│                                                              │
│  PrinterController                                            │
│    GET  /api/printer/status   → getStatus() (estático)       │
│    POST /api/printer/test     → printTest() → PrintPayload   │
│    POST /api/printer/reprint/:id → printTicket(order, event) │
│                                                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP JSON
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Web App (Cliente)                        │
│                                                              │
│  usePrinterStatus() hook                                     │
│    ├── useSyncExternalStore(printerManager)                  │
│    ├── printTicket(result) → manager.print({data, content})  │
│    ├── testPrint() → printerService.test() → manager.print() │
│    └── reprintTicket(id) → printerService.reprint(id) → ...  │
│                                                              │
│  PrinterManager (singleton)                                  │
│    ├── selectTransport() → native | ble-s1 | webusb          │
│    ├── pair() → transport.pair()                             │
│    ├── connect() → transport.connect() (BLE wakeup)          │
│    └── print() → queue.enqueue({ run: transport.print })     │
│                                                              │
│  PrintQueue (FIFO, max 10)                                   │
│    └── pump() → job.run() secuencial                         │
│        ├── ok → next job                                     │
│        └── error → cascade: reject all pending               │
│                                                              │
│  Transporte seleccionado:                                     │
│  ┌─────────────────┬──────────────────┬────────────────────┐ │
│  │ Native Bridge    │ BLE S1           │ WebUSB             │ │
│  │                  │                  │                    │ │
│  │ MiBolichePrinter │ renderTicketBmp()│ decodeBase64()     │ │
│  │ .print(base64)   │ buildS1Sequence()│ device.transferOut │ │
│  │                  │ GATT writes      │                    │ │
│  │ ESC/POS texto    │ Raster 384px     │ ESC/POS texto      │ │
│  └─────────────────┴──────────────────┴────────────────────┘ │
│                                                              │
│  UI (Sidebar / VentaSection / HistorialSection)              │
│    ├── Status chip: conectada / vincular / error              │
│    ├── Auto-print post-pago                                  │
│    └── Botón "Reimprimir Ticket" por orden                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Lo que NO se tocó (exclusiones conscientes)

- **No se imprime desde el server**: `printTicket()` y `printTest()` en el server retornan `PrintPayload` (datos), nunca tocan hardware. El nombre `print*` es semántico ("preparar para imprimir"), no literal.
- **No hay paper sensor**: la S1 no expone sensor de papel por BLE. El ROADMAP lo lista como riesgo conocido. El único feedback es "no imprimió" → error en cascada de la cola.
- **No hay preview de ticket**: el raster se genera on-demand al imprimir. Si se quisiera un preview en pantalla, `renderTicketBitmap` ya devuelve el bitmap — solo faltaría mostrarlo en un `<canvas>` de la UI.
- **No hay cancelación de impresión en progreso**: una vez que `print()` empezó, no se puede abortar. Baja prioridad (las impresiones duran ~5 segundos).
- **No se persiste el estado de la cola**: si se recarga la página durante un print, los jobs pendientes se pierden. Aceptable: el cajero puede reimprimir desde el historial.
