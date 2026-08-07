# Impresión Bluetooth para la comandera (impresora S1)

**Estado**: `implementada` *(gates físicos pasados 2026-08-07; pendiente menor: re-verificar reconexión sin prompt tras recarga — T2)*
**Fecha**: 2026-08-07
**Contexto**: pivot cloud + comandera ([`ROADMAP.md` §PIVOT](../ROADMAP.md)) — punto 4: "Impresión sin app intermediaria".

---

## Problema / Por qué

Con el modelo comandera, una persona circula por la pista con una tablet y una impresora térmica
Bluetooth portátil (la Lujiang S1), registra la venta y entrega el ticket ahí mismo. Hoy eso es
imposible: la impresión de `/caja` está atada a la ticketera USB fija (NICTOM IT06, cable mediante),
por WebUSB o por el puente nativo del APK. No existe ningún camino Bluetooth.

El protocolo de la S1 ya fue **validado con el aparato físico** (2026-08-04): imprime vía Web
Bluetooth desde Chrome Android, sin la app del fabricante. Lo que falta es exactamente esta feature:
que ese camino probado viva dentro de `/caja` y no en una página de prueba suelta.

Dos restricciones de fondo que la spec asume como hechos (no como decisiones abiertas):

1. **La S1 no imprime texto ESC/POS**: solo acepta imagen raster de 384px de ancho, con una
   secuencia de comandos propia (enable → wake → densidad → raster en chunks → feed → stop, en ese
   orden estricto). El ticket actual viaja del server como *texto* ESC/POS — para la S1 el ticket
   tiene que rasterizarse. Es un cambio de contrato de impresión, no solo un transporte nuevo.
2. **El APK (WebView) no soporta Web Bluetooth**: el camino validado es Chrome. Esta feature apunta
   a `/caja` corriendo en Chrome de la tablet (contexto seguro/HTTPS obligatorio). El APK sigue
   siendo el camino de la ticketera USB; no se le agrega BLE nativo en esta feature.

**Rol beneficiado**: `caja` (la persona con la comandera). Secundario: `admin` (el ticket entregado
sostiene el arqueo por barra que motivó el pivot).

## Objetivo

Que la cajera, desde `/caja` en Chrome de la tablet, pueda **vincular la impresora S1 una sola
vez** y a partir de ahí **cada venta confirmada imprima su ticket automáticamente por Bluetooth**,
con reconexión sin fricción, reimpresión disponible y estados visibles — sin que ninguna falla de
impresión afecte jamás el registro de la venta.

Comportamiento observable, de punta a punta:

- En `/caja` hay una acción visible de vincular impresora que, en un entorno soportado, encuentra
  la S1, la vincula y deja el estado en "Impresora vinculada".
- Confirmada una venta cobrable en el momento (efectivo/cortesía o pago ya acreditado), el ticket
  sale por la S1 **legible y completo**, con el mismo contenido que el ticket actual (marca, número
  de venta, fecha, ítems, clave de la noche, código de retiro) **más un agregado pedido con esta
  feature: la fecha de la noche impresa arriba del todo** (derivada del inicio de la noche activa,
  y también en el ticket USB — el contenido es uno solo).
- Si la impresora está apagada, lejos o falla a mitad de impresión: la venta queda registrada
  igual, la UI lo dice claro y ofrece reintentar/reimprimir.
- Al volver a `/caja` (recarga, otra noche, la impresora vuelve a estar en rango), la app
  **reconecta con la S1 ya vinculada sin volver a pedir elegir el dispositivo**.
- La ticketera USB actual sigue funcionando exactamente como hoy: un puesto fijo con APK + USB no
  se ve afectado por esta feature.

## Historias de usuario

- Como **caja (comandera)** quiero vincular la impresora Bluetooth desde la pantalla de caja para
  imprimir tickets sin cables mientras circulo por la pista.
- Como **caja** quiero que al confirmar una venta el ticket salga solo por la impresora, para
  entregárselo al cliente en el momento sin pasos extra.
- Como **caja** quiero que si la impresora se apagó o quedó fuera de alcance la app me lo muestre
  y se reconecte sola cuando vuelva, sin tener que re-vincularla cada vez.
- Como **caja** quiero poder reimprimir un ticket (desde la pantalla de éxito o desde el
  historial) cuando el papel salió mal o el cliente lo perdió.
- Como **caja** quiero una impresión de prueba para verificar que la impresora responde antes de
  arrancar la noche.
- Como **caja** quiero un mensaje claro si mi entorno no soporta la impresora Bluetooth (estoy en
  el APK, o sin conexión segura), que me diga qué usar en su lugar.
- Como **admin/dueño** quiero que el ticket Bluetooth conserve el contenido y la función del
  ticket actual (código de retiro, clave de la noche), para que el circuito de entrega en barra no
  cambie.

## Criterios de aceptación

**Vinculación**
1. *Given* `/caja` en Chrome Android con Bluetooth activo y origen seguro, *when* la cajera toca
   "Vincular impresora" y elige la S1 en el selector del navegador, *then* el estado pasa a
   "Impresora vinculada" y queda persistido para próximas sesiones.
2. *Given* un entorno sin soporte (APK/WebView, o contexto no seguro), *when* la cajera intenta
   vincular Bluetooth, *then* ve un mensaje que explica el requisito (Chrome con HTTPS) — nunca un
   fallo silencioso ni un botón que no hace nada.

**Impresión en venta**
3. *Given* la S1 vinculada y encendida, *when* se confirma una venta con ticket (efectivo,
   cortesía, o pago MP acreditado), *then* el ticket se imprime automáticamente, legible (sin
   caracteres corruptos ni cortes), con el mismo contenido que el ticket USB actual.
4. *Given* la S1 apagada o fuera de alcance, *when* se confirma una venta, *then* la venta queda
   registrada normalmente, la UI muestra el error de impresión y ofrece reintentar; el reintento
   con la impresora ya disponible imprime el ticket completo.
5. Una impresión en curso no bloquea la operación de la caja: la cajera puede seguir cargando la
   venta siguiente mientras sale el papel.

**Reconexión**
6. *Given* una S1 vinculada previamente, *when* la cajera recarga la página o vuelve a entrar a
   `/caja`, *then* la app reconecta sin mostrar el selector de dispositivos de nuevo (a lo sumo un
   toque para reactivar, nunca re-elegir la impresora).
7. *Given* una desconexión transitoria (fuera de rango y vuelta), *when* llega la siguiente
   impresión, *then* la app intenta reconectar sola antes de reportar error.

**Reimpresión y prueba**
8. La reimpresión desde la pantalla de éxito de venta y desde el historial imprime por la S1 con
   las mismas reglas que hoy (bloqueada si el pago sigue `pendiente_de_cobro`).
9. La impresión de prueba del sidebar sale por la S1 cuando está vinculada.

**Estados y coexistencia**
10. El sidebar de `/caja` refleja el estado real: no vinculada / vinculada / imprimiendo / error,
    sin que el chequeo periódico de estado rompa la conexión.
11. En un dispositivo con la ticketera USB (APK o Chrome con WebUSB), el flujo actual sigue intacto:
    mismos botones, mismo comportamiento. La existencia del camino Bluetooth no degrada el USB.
12. `pnpm typecheck` y los tests existentes de impresión siguen en verde; el comportamiento nuevo
    queda cubierto por tests propios.

## Fuera de alcance

- **Deploy cloud, hosting y HTTPS de producción** — lo fija la spec `deploy-cloud-comandera`
  (pendiente). Esta feature solo *requiere* origen seguro; cómo se provee en producción no se
  decide acá.
- **Manifest PWA / instalación en pantalla de inicio** — va con la spec de deploy/PWA comandera.
- **BLE nativo en el APK** (`window.MiBolichePrinter` Bluetooth) — descartado por ahora; el APK
  queda como shell de la ticketera USB fija.
- **Indicador de batería de la S1** — el aparato no expone el servicio estándar de batería; no hay
  forma por software. Mitigación operativa (cargarla antes de la noche), no de producto.
- **Soporte de otras impresoras Bluetooth** (genéricas ESC/POS BLE u otros modelos) — solo la S1 y
  compatibles con su mismo protocolo.
- **Cambios al contenido o diseño del ticket** — con una única excepción pedida junto con esta
  feature: **la fecha de la noche arriba del todo**. El resto del ticket dice lo mismo que hoy;
  solo cambia cómo llega al papel.
- Pedido de cliente por QR, flujo Posnet, y todo lo demás que el pivot ya sacó del modelo.

## Preguntas abiertas

1. **¿Dónde se rasteriza el ticket?** El server hoy entrega bytes de texto ESC/POS; la S1 necesita
   bitmap de 384px. ¿Rasteriza el server (nuevo formato en `ticketData`) o el cliente (recibe el
   contenido y dibuja)? Impacta el contrato `ticketData` y la reimpresión. → decidir en `/plan`.
2. **Selección de transporte**: si un dispositivo tuviera USB y Bluetooth disponibles a la vez,
   ¿prioridad fija o elección explícita de la cajera? (En la práctica comandera=BLE y puesto
   fijo=USB, pero el caso borde existe.)
3. **Tipografía y densidad del raster**: qué tamaño de letra hace el ticket legible en 384px con
   el contenido actual (hoy 32 columnas de texto). Validar con impresiones físicas.
4. **Reconexión sin prompt en Chrome Android**: `navigator.bluetooth.getDevices()` necesita el
   permissions backend nuevo de Chrome; verificar en `/plan` si la versión de Chrome de la tablet
   lo trae activo por defecto o requiere flag (si requiere flag, documentar el setup de la tablet).
5. **HTTPS en desarrollo para probar desde la tablet**: mkcert exige instalar la CA en la tablet.
   ¿Se prueba así, o directo contra un deploy con TLS real? (Se toca con la spec de deploy.)
6. **Timeout/reintentos de impresión**: cuántos reintentos automáticos y con qué espera antes de
   declarar el error a la cajera (la secuencia de la S1 incluye esperas fijas; una noche con la
   comandera no puede quedarse mirando un spinner).

> Las preguntas 1, 2, 4 y 6 quedan **resueltas** en el plan técnico de abajo. La 3 (legibilidad
> del raster) se valida con papel al principio de la implementación; la 5 (HTTPS dev) se resuelve
> con mkcert + CA en la tablet para dev, y la de producción la fija `deploy-cloud-comandera`.

---

## Plan técnico

*(2026-08-07 — diseño validado con `architect-reviewer`; código de referencia funcionando en
`~/dev/cocktrail-ble-test/index.html`, protocolo confirmado con el hardware el 2026-08-04.)*

### Enfoque

El server deja de ser "el que arma los bytes imprimibles" y pasa a ser **el dueño del contenido**:
una representación intermedia única `TicketContent` (JSON con valores ya formateados) de la que se
derivan las dos salidas — los bytes ESC/POS de texto para la ticketera USB (intactos) y el raster
que dibuja el cliente para la S1. En el cliente se extrae una interfaz `PrinterTransport` con tres
implementaciones (puente nativo APK, WebUSB, Web Bluetooth S1); la S1 rasteriza con canvas a 384px
y manda la secuencia propietaria validada. Reconexión y cola de impresión son **un solo
mecanismo**: los trabajos se encolan secuenciales y el primer paso de cada job es `ensureConnected`.
**Primera tarea de la implementación: validar con papel la legibilidad del ticket a 384px** — si la
tipografía no da, cambia el diseño del content antes de construir el resto.

### Archivos/módulos afectados

**API (contrato de contenido — `TicketContent` como representación intermedia única):**
- `apps/api/src/modules/printer/printer.service.ts` — refactor: `buildTicketContent(order, event): TicketContent`
  (único lugar que sabe qué dice un ticket; valores listos para mostrar: `nightDateText` —
  **fecha de la noche, arriba del todo, derivada de `nightEvent.startedAt`** —, `brand`, `saleText`,
  `dateText` es-AR, `items[{qty,name}]`, `keywordText`, `codeShort` = 4 chars) y
  `buildTicketBytes(content)` (el ESC/POS actual pasa a consumir el content, no el `Order` crudo
  → imposible que diverjan). `renderTest()` también produce su content.
- `apps/api/src/modules/printer/printer.controller.ts` — `POST /test` y `POST /reprint/:orderId`
  devuelven el par `{ data (base64 ESC/POS), ticketContent }`. Reglas actuales intactas
  (reprint bloqueado si `pendiente_de_cobro`, noche activa requerida).
- `apps/api/src/modules/orders/orders.service.ts` (~L183-196) — adjunta `ticketContent` junto a
  `ticketData` en la respuesta de creación (mismas condiciones que hoy; si el render falla, la
  venta no se cae).

**Shared (contrato cross-boundary):**
- `packages/shared/src/domain.ts` — tipo `TicketContent`; mover ahí `CreateOrderResult` (hoy
  duplicado solo en `apps/web/src/services/orders.service.ts:4` — drift latente preexistente) con
  `ticketData?` y `ticketContent?`.

**Web (transporte — módulo nuevo `lib/printing/`):**
- `apps/web/src/lib/printing/types.ts` — `PrinterTransport { id, isAvailable(), isConnected(), pair(), print(payload) }`
  con `PrintPayload { escposBase64: string; ticketContent: TicketContent }` — **ambos campos
  requeridos** (el server siempre manda el par; ningún llamador puede armar un payload que un
  transporte no sepa imprimir).
- `apps/web/src/lib/printing/select-transport.ts` — política de prioridad en un solo lugar:
  puente nativo (APK; en WebView no hay BLE) → S1 vinculada (`navigator.bluetooth.getDevices()` +
  `device.id` en `localStorage`) → WebUSB. Seam para una preferencia explícita futura.
- `apps/web/src/lib/printing/queue.ts` — cola secuencial in-memory. Cada job lleva
  `orderId`/`displayNumber`. **Fallo en cascada**: si un job falla por conexión, la cola se pausa y
  falla todo lo pendiente con UN mensaje ("N tickets sin imprimir — reimprimí desde el historial"),
  no gotea timeouts seriales. Cota de tamaño; reload pierde pendientes (aceptable: existe reprint).
- `apps/web/src/lib/printing/raster.ts` — **función pura, sin DOM ni BLE**: canvas offscreen 384px
  desde `TicketContent`, binarización threshold 128, bits monocromo MSB-first.
- `apps/web/src/lib/printing/s1-protocol.ts` — **función pura**: framing `GS v 0` (1D 76 30),
  chunks de 512B, secuencia ENABLE (10 FF F1 03) → wake (12×0x00) → densidad (10 FF 10 00 01) →
  imagen (10ms entre chunks) → feed (1B 4A 50) → ~2s → stop (10 FF F1 45). Unit-testeable contra
  bytes dorados del hardware ya validado.
- `apps/web/src/lib/printing/transports/native-bridge.ts` y `transports/webusb.ts` — extracción de
  `apps/web/src/lib/webusb-printer.ts` (un solo consumidor: se mueve sin shim de compatibilidad;
  `webusb-printer.ts` se elimina).
- `apps/web/src/lib/printing/transports/ble-s1.ts` — GATT: servicio `0xff00`, característica
  `0xff02`, `writeValueWithoutResponse`. Cachea `BluetoothRemoteGATTServer`;
  `ensureConnected` corre DENTRO del job de la cola (nunca dos `gatt.connect()` concurrentes);
  listener `gattserverdisconnected` para estado; **timeout de conexión 5s + 1 reintento
  automático**, después error a la cajera. El polling de estado cada 30s NO conecta: reporta
  "emparejada" (getDevices la conoce) vs "conectada" (GATT vivo) — sin fingir un connected no
  verificado.
- Manager framework-agnóstico en `lib/printing/` (selección + cola + estado, con `subscribe()`);
  `apps/web/src/hooks/usePrinterStatus.ts` se adelgaza a adaptador React del manager (evitar hook
  dios; el estado de la cola NO vive en React state).
- `apps/web/src/services/orders.service.ts` — usa `CreateOrderResult` de shared.
- UI de caja (`Sidebar.tsx`, `VentaSection.tsx`, `HistorialSection.tsx`, `useCheckout.ts`): misma
  interfaz de props; cambios solo de copy ("Impresora" en vez de "Impresora USB") y el estado
  emparejada/conectada en el Sidebar. Mensaje claro en entorno sin soporte (criterio 2).

**Docs:**
- `docs/ARCHITECTURE.md` — amendar la regla de impresión: "el server es dueño del contenido; el
  device es dueño de la representación física". Actualizar el comentario de cabecera de
  `printer.service.ts` (que no quede mintiendo como el viejo CLAUDE.md).

### Cambios de datos

- **Sin migraciones Supabase.** No se persiste nada nuevo en DB; sin impacto en sync local↔cloud.
- Tipos nuevos en `packages/shared`: `TicketContent`; `CreateOrderResult` movido desde la web.
- Estado en el device (no DB): `localStorage` con el `device.id` BLE vinculado.

### Real-time

Sin eventos SSE nuevos. La impresión es local al device de caja; el estado de la impresora no se
propaga a otras pantallas (igual que hoy con USB).

### Auth/permisos

Sin cambios. Los endpoints de printer mantienen `requireRole("admin","caja")`; la vinculación BLE
es un permiso del **navegador** (gesto de usuario + prompt de Chrome), no del backend.

### Riesgos (priorizados)

1. ~~Drift ESC/POS vs JSON~~ — **resuelto por diseño** con `TicketContent` como IR única (la
   corrección más importante de la revisión de arquitectura).
2. **Legibilidad del raster a 384px** (alto, riesgo de producto): el contenido actual son 32
   columnas con ítems en doble tamaño. Se valida con impresiones físicas ANTES de construir el
   camino completo; si no da, se ajusta tipografía/layout del content.
3. **Reconexión sin prompt en Chrome de la tablet** (medio): `navigator.bluetooth.getDevices()`
   necesita el permissions backend nuevo; verificar en la tablet real al principio. Si requiere
   flag, documentar el setup del dispositivo en la spec de deploy.
4. **Quirk de Chrome Android**: primer `gatt.connect()` tras desconexión larga puede colgar —
   mitigado con timeout 5s + 1 reintento dentro de la cola.
5. **Testeo BLE no automatizable** (medio): Web Bluetooth no es cubrible por Playwright. Estrategia:
   unit tests puros de `s1-protocol`/`raster` contra bytes dorados del hardware validado, cola con
   fake timers, selección de transporte con `window` mockeado. El criterio 12 NO se interpreta como
   "E2E de BLE"; el gate final es físico (imprimir una venta real desde la tablet).
6. **Deuda que se toca**: `webusb-printer.ts` se elimina (absorbe su lógica el módulo nuevo);
   el tipo duplicado `CreateOrderResult` se unifica en shared.

### Alternativas consideradas

- **Rasterizar en el server** (node-canvas/sharp): descartada — dependencia nativa pesada en el
  API (complica el deploy cloud del pivot), fonts en el server, y acopla el backend a un modelo de
  impresora, rompiendo la regla vigente de que el hardware vive en el device.
- **BLE nativo en el APK** (`PrinterBridge` Bluetooth + permisos `BLUETOOTH_SCAN/CONNECT`):
  descartada por ahora — rebuild de APK por cada cambio, Android Studio en el loop, y el camino
  Chrome ya está validado con el hardware. El APK queda como shell USB del puesto fijo.
- **Convertir `ticketData` (ESC/POS texto) a bitmap en el cliente** (parsear ESC/POS y "dibujarlo"):
  descartada — implica escribir un intérprete ESC/POS en el navegador para deshacer un formato que
  el mismo sistema generó; el content estructurado es más simple y más robusto.
- **Tercer transporte dentro de `webusb-printer.ts` con `if`s** (sin interfaz): descartada — ya
  hay dos transportes mezclados con prioridad implícita; un tercero multiplica el acoplamiento y
  deja el módulo intesteable.

---

## Tareas

> **Hallazgos del gate físico (2026-08-07, tablet de producción: Lenovo Tab P11):**
> 1. **MTU BLE**: los chunks de 512 bytes (validados el 04/08 desde un celular) se truncan EN
>    SILENCIO en la Tab P11 (Android trunca `writeValueWithoutResponse` > MTU−3 sin error) →
>    impresión ilegible. Con chunks de **20 bytes** imprime perfecto. El MTU depende del
>    dispositivo y Web Bluetooth no lo expone: el módulo usa 20 por defecto y permite subir por
>    `localStorage["cocktrail.ble-chunk"]` tras probar en el dispositivo real.
> 2. ~~**Alto por bloque**: el firmware solo honra `yL`, hay que partir en franjas.~~
>    **DIAGNÓSTICO ERRÓNEO, corregido el 2026-08-07** — ver el bloque de abajo.
> 3. **Ancho 576 descartado**: cuelga el firmware (y desconecta) — el cabezal es de 384 puntos.
> 4. La app oficial Luck Jingle no interfiere (se descartó); sirve como referencia de que el
>    hardware imprime bien y para ver el % de batería (que BLE no expone).
>
> **Calibración final (cierre de T1, 2026-08-07, validada imprimiendo en papel):**
> 5. **~~m=2 (doble alto) + downsample~~ → DESCARTADO: era la causa de los tickets cortados.**
>    Con m=0x02 el firmware espera `ancho × alto de salida` bytes de raster: se quedaba esperando
>    el doble, se comía el header del bloque siguiente como si fueran píxeles (la línea de basura
>    visible en el papel) y dejaba el resto en blanco (el hueco de ~2cm). Con UN trago no se notaba
>    porque no había bloque siguiente. **Ahora: resolución completa, UN bloque, m=0x00**, que es lo
>    que hace la app del fabricante —se la capturó mandando 831 filas de una— y lo que fijan las
>    tres implementaciones de referencia de esta familia (`lsongdev/luckjingle-d1-printer`,
>    `Dejniel/TiMini-Print`, `ChiaraCannolee/thermal-pocket-printer-basic`). Verificado en
>    producción con 4 y 8 tragos. Cuesta el doble de datos: ~9s (1 trago), 17s (4), 28s (8).
> 6. **`ESC J` antes del bloque de imagen CUELGA el firmware** y apaga la impresora. Se intentó
>    para centrar el ticket verticalmente (repartir el relleno arriba y abajo) y falló con "GATT
>    operation failed". El relleno de largo mínimo va SIEMPRE después de la imagen: **el ticket no
>    se puede centrar en el papel**. Es la misma limitación por la que se descartó saltear las
>    filas en blanco.
> 7. **Contenido y tipografía finales** (validados en papel con el dueño): el ticket NO lleva
>    marca, ni fecha de la venta (ya está la de la noche arriba), ni código de retiro (lo canjeaba
>    la pantalla de barra, que no existe con el modelo comandera), ni líneas separadoras. Tamaños
>    en `RASTER_LAYOUT`: ítems 50px (lo más grande, es lo que lee el barman), clave 36px, número de
>    venta 32px, fecha de la noche 28px; los tres primeros con "doble pasada" (fillText ×3 con 1px
>    de corrimiento) para que impriman más negro. Densidad 1, sans-serif, largo mínimo 520 dots.
> 8. **La impresora se apaga sola** por ahorro de energía (hardware). El sidebar ofrece "Conectar
>    impresora" cuando ya está vinculada, para despertarla sin pasar por el selector del navegador.
> 9. **La S1 es una impresora de FOTOS usada como impresora de tickets**: por eso hacen falta
>    30.000 bytes para imprimir cuatro renglones. Reemplazo identificado: **Goojprt MPT-II**
>    (ESC/POS sobre BLE, servicio `18F0`, con canal de estado), que está mapeada en
>    `NielsLeenheer/WebBluetoothReceiptPrinter`. Con ESC/POS el ticket son ~500 bytes en vez de
>    30.000 → prácticamente instantáneo. Verificar antes de comprar con `chrome://bluetooth-internals`
>    que el aparato anuncie `18F0`.


### Bloque 0 — Validaciones tempranas (gates físicos, ANTES de construir el resto)

- [x] **T1 — Gate de legibilidad del raster a 384px** *(con Manuel + impresora física)*: extender
  `~/dev/cocktrail-ble-test/index.html` para dibujar el layout REAL del ticket (**fecha de la
  noche arriba del todo**, brand doble tamaño, `Venta #N`, fecha, ítems `Nx Nombre` grandes,
  separadores, clave de noche, `cod:`) e
  imprimirlo en la S1. Iterar tipografía/tamaños hasta que sea legible. **El resultado fija los
  parámetros de `raster.ts` (fuentes, px por línea)**. Si no da, se re-diseña el content antes de
  seguir.
- [ ] **T2 — Gate de reconexión sin prompt** *(con Manuel + tablet)*: en el Chrome de la tablet,
  verificar que `navigator.bluetooth.getDevices()` devuelve la S1 tras vincular y recargar la
  página (¿necesita `chrome://flags/#enable-web-bluetooth-new-permissions-backend`?). Documentar
  versión de Chrome y setup en esta spec.

### Bloque A — Tipos compartidos

- [x] **T3 — `TicketContent` en shared**: definir `TicketContent` y mover `CreateOrderResult`
  (con `ticketData?` y `ticketContent?`) a `packages/shared/src/domain.ts`; eliminar el duplicado
  de `apps/web/src/services/orders.service.ts:4`. `pnpm typecheck`.

### Bloque B — Backend (API: content como representación única)

- [x] **T4 — Refactor `printer.service.ts`**: `buildTicketContent(order, event): TicketContent`
  (valores listos: `nightDateText` arriba del todo, `brand`, `dateText` es-AR, `codeShort` 4
  chars…) y `buildTicketBytes(content)` consumiendo el content; `renderTest()` produce su content.
  Tests unit del módulo printer actualizados (único cambio esperado en los bytes ESC/POS: la línea
  nueva de fecha de la noche al tope; el resto idéntico — asserts de regresión).
- [x] **T5 — `printer.controller.ts`**: `POST /api/printer/test` y `POST /api/printer/reprint/:orderId`
  devuelven `{ data, ticketContent }`. Reglas intactas (reprint bloqueado si `pendiente_de_cobro`,
  noche activa). Tests del controller.
- [x] **T6 — `orders.service.ts` (API, ~L183-196)**: adjuntar `ticketContent` junto a `ticketData`
  (mismas condiciones; si el render falla la venta no se cae). Tests de orders actualizados.

### Bloque C — Web: módulo `lib/printing/` (núcleo puro primero)

- [x] **T7 — `raster.ts`** (puro, sin DOM en la lógica de bits): render de `TicketContent` a canvas
  384px (parámetros salidos de T1) + binarización threshold 128 + empaquetado monocromo MSB-first.
  Unit tests de los bits (patrones conocidos → bytes esperados).
- [x] **T8 — `s1-protocol.ts`** (puro): framing `GS v 0`, chunking 512B, secuencia
  enable→wake→densidad→imagen→feed→stop con sus delays como datos (no `setTimeout` adentro).
  Unit tests contra los bytes dorados de la validación física del 2026-08-04.
- [x] **T9 — `types.ts` + `select-transport.ts`**: interfaz `PrinterTransport`, `PrintPayload`
  con ambos campos requeridos; política de prioridad nativo → BLE vinculada → WebUSB con seam
  para preferencia futura. Tests de selección con `window` mockeado.
- [x] **T10 — `transports/native-bridge.ts` + `transports/webusb.ts`**: migrar la lógica de
  `apps/web/src/lib/webusb-printer.ts` a la interfaz nueva y **eliminar** ese archivo (único
  consumidor: `usePrinterStatus`). Sin cambio de comportamiento USB.
- [x] **T11 — `transports/ble-s1.ts`**: GATT (servicio `0xff00`, char `0xff02`,
  `writeValueWithoutResponse`), cache del `BluetoothRemoteGATTServer`, `ensureConnected` con
  timeout 5s + 1 reintento, listener `gattserverdisconnected`, persistencia del `device.id` en
  `localStorage`, re-obtención vía `navigator.bluetooth.getDevices()`.
- [x] **T12 — `queue.ts`**: cola secuencial con identidad de job (`orderId`/`displayNumber`),
  `ensureConnected` como primer paso del job, **fallo en cascada** (pausa + falla todo lo
  pendiente con un solo mensaje), cota de tamaño. Tests con fake timers.
- [x] **T13 — Manager de impresión** (`lib/printing/`, framework-agnóstico con `subscribe()`):
  integra selección + cola + estado (no-vinculada / emparejada / conectada / imprimiendo / error).
  El polling de 30s solo reporta, no conecta.

### Bloque D — Web: integración React y UI *(candidato a `expert-react-frontend-engineer`)*

- [x] **T14 — `usePrinterStatus` adelgazado**: adaptador React del manager (suscripción → estado);
  misma superficie de props hacia `CajaClient`/`Sidebar`/secciones. `useCheckout` pasa el payload
  par `{escposBase64, ticketContent}`; el catch de auto-print sigue sin bloquear la venta.
- [x] **T15 — UI de caja**: `Sidebar.tsx` muestra emparejada/conectada/imprimiendo/error y copy
  sin "USB" hardcodeado; mensaje claro en entorno sin soporte (APK/WebView o sin HTTPS → "Usá
  Chrome con HTTPS"); "Vincular impresora" dispara `requestDevice` (gesto de usuario).
  `VentaSection`/`HistorialSection`: reimpresión y estados de error con el mensaje de cola en
  cascada ("N tickets sin imprimir — reimprimí desde el historial").

### Bloque E — Verificación

- [x] **T16 — `pnpm typecheck` + suites completas** (api y web) en verde.
- [x] **T17 — E2E con transporte simulado** *(subagent `e2e-playwright-tester`)*: flujo caja
  completo con un `PrinterTransport` fake inyectado (Playwright no puede automatizar prompts de
  Web Bluetooth): venta → auto-print OK; venta con impresora "caída" → la venta queda y la UI
  ofrece reintentar; reimpresión desde historial.
- [x] **T18 — Gate físico final** *(con Manuel: tablet + S1)*: `pnpm dev:web:https` + CA mkcert en
  la tablet → vincular S1 desde `/caja` en Chrome → venta real imprime ticket legible →
  reimpresión → apagar/prender impresora y verificar reconexión sin re-vincular → recargar página
  y verificar reconexión sin prompt (T2). Criterios de aceptación 1-11 tildados contra la
  realidad.

### Bloque F — Docs

- [x] **T19 — `docs/ARCHITECTURE.md`**: amendar la regla de impresión ("el server es dueño del
  contenido; el device, de la representación física") + actualizar el comentario de cabecera de
  `printer.service.ts`. `docs/ROADMAP.md`: tildar el punto 4 del pivot (impresión sin app
  intermediaria) cuando T18 pase. Estado de esta spec → `implementada`.

> Implementar con **Plan Mode** (el cambio toca API + shared + refactor del módulo de impresión
> completo). Ir tildando `- [x]` a medida que se completa. T1 y T2 van PRIMERO: son baratos y
> pueden cambiar el diseño del resto.
