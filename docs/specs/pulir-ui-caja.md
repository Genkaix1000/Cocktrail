# Pulir UI de Caja

**Estado**: done
**Fecha**: 2026-07-10

---

## Problema / Por qué

`/caja` (rol `caja`, cobro presencial) hoy es un flujo 100% dependiente de mouse/touch: sumar
tragos requiere click por click sobre el grid (`VentaSection.tsx`), abrir el cobro es un click en
"Cobrar", elegir el método de pago es otro click, y en efectivo el monto recibido se tipea a mano
en un input de texto sin ningún atajo (ni "monto exacto" cuando el cliente paga justo, que es el
caso más común). Cerrar el ciclo después de una venta (volver a "Nueva Venta") también requiere
click. No hay un solo atajo de teclado en toda la pantalla.

Esto no acompaña el ritmo real de una barra con cola de gente esperando: cada venta suma varios
clicks y tipeo manual que podrían resolverse en menos pasos con teclado, en la máquina de la
caja (la caja corre en la PC servidor del boliche, con teclado físico disponible — no es una
tablet exclusivamente táctil).

Además se detectó un delay artificial de ~800ms antes de mostrar el grid de productos
(`VentaSection.tsx`, `useEffect` con `setTimeout` puesto para lucir el skeleton de carga, sin
carga real detrás) que suma latencia percibida a cada apertura de la pantalla sin ningún
beneficio.

**Para quién**: la cajera/o (rol `caja`) que cobra pedidos presenciales durante el turno.

---

## Objetivo

Que una venta en efectivo con pago exacto —el caso más común— se pueda completar de punta a
punta sin tocar el mouse: buscar y sumar productos, abrir el cobro, elegir método, cargar el
monto y confirmar, todo por teclado. Los métodos con Posnet (tarjeta/QR) se abren igual por
teclado, aunque el resto de ese flujo (esperar el pago en el lector físico) sigue como está.

El uso táctil/mouse actual (grid de tragos, botones del modal) se mantiene intacto como
alternativa — el teclado es un modo adicional, no un reemplazo.

---

## Historias de usuario

- Como **cajera**, quiero buscar un trago escribiendo su nombre y sumarlo al carrito con el
  teclado, para no tener que ubicarlo a ojo en el grid en medio de una cola.
- Como **cajera**, quiero abrir el cobro con Enter una vez que cargué el pedido, sin tener que
  ir a buscar el botón "Cobrar" con el mouse.
- Como **cajera**, quiero elegir el método de pago (Efectivo/Tarjeta/QR) apretando una tecla
  numérica, en vez de apuntar y hacer click en el botón correspondiente.
- Como **cajera**, quiero cargar "monto exacto" con una tecla cuando el cliente paga justo, en
  vez de tipear el número a mano.
- Como **cajera**, quiero confirmar el cobro en efectivo con Enter en vez de buscar el botón
  "Pedido Concretado".
- Como **cajera**, quiero volver a "Nueva Venta" con una tecla apenas veo el ticket de éxito,
  para encarar la siguiente venta sin perder tiempo.
- Como **cajera**, quiero que el grid de productos aparezca sin una demora artificial al entrar
  a la pantalla de venta.

---

## Criterios de aceptación

1. **Given** la cajera está en la pantalla de venta, **when** escribe en el buscador de
   productos, **then** la lista se filtra por nombre y las flechas ↑/↓ mueven la selección entre
   los resultados filtrados.
2. **Given** un producto está resaltado en los resultados del buscador, **when** la cajera
   presiona Enter, **then** ese producto se suma al carrito (equivalente a un click en "Agregar").
3. **Given** hay al menos un item en el carrito y el foco no está en el buscador de productos,
   **when** la cajera presiona Enter, **then** se abre el modal de cobro (equivalente a click en
   "Cobrar").
4. **Given** el modal de cobro está abierto en la pantalla de selección de método, **when** la
   cajera presiona "1", "2" o "3", **then** se selecciona Efectivo, Tarjeta o QR respectivamente
   (mismo comportamiento que hacer click en cada botón, incluyendo que Tarjeta/QR arrancan el
   flujo Posnet existente sin cambios).
5. **Given** el método "Efectivo" está seleccionado, **when** la cajera activa "Monto exacto"
   (tecla o botón), **then** el monto recibido se completa automáticamente con el total a cobrar
   y el vuelto queda en $0.
6. **Given** el monto recibido en efectivo es válido (cubre el total), **when** la cajera
   presiona Enter, **then** se confirma la venta (equivalente a click en "Pedido Concretado").
7. **Given** la venta se concretó y se muestra la pantalla de éxito con el ticket, **when** la
   cajera presiona Enter o Espacio, **then** se vuelve al estado de "Nueva Venta" (carrito vacío,
   listo para la siguiente venta).
8. **Given** la cajera entra a la pantalla de venta, **when** los productos ya están disponibles,
   **then** el grid se muestra sin el delay artificial de ~800ms que existe hoy.
9. **Given** el flujo Posnet está en curso (esperando el lector, `ON_TERMINAL`, polling,
   cancelación), **then** ese comportamiento no cambia — los atajos nuevos solo aplican a abrir
   el cobro y elegir el método, no a los estados intermedios de Posnet.
10. **Given** la cajera usa mouse/touch en cualquier paso, **then** el flujo actual sigue
    funcionando exactamente igual que hoy (los atajos son un modo adicional, no un reemplazo).

---

## Fuera de alcance

- Soporte específico para tablet táctil sin teclado físico (numpad en pantalla, adaptación por
  detección de dispositivo, etc.) — queda igual que hoy; se evalúa más adelante con uso real en
  el boliche.
- Modo kiosco y accesos simplificados (mDNS/hostname, PWA instalable, atajos de escritorio tipo
  `chrome --app`) — ya está anotado en la Fase 6 del roadmap ("Acceso simple sin escribir
  IP/localhost"), no es parte de esta fase.
- Cambios en `/barra` o `/admin`.
- Cambios en el flujo interno de Posnet una vez iniciado (estados `ON_TERMINAL`, polling,
  cancelación de intención de cobro) — se mantiene tal cual está.
- Pruebas E2E automatizadas de punta a punta (eso es la Fase 4 del roadmap, alcance a definir
  aparte).
- Botones de redondeo a billetes comunes en efectivo (solo "monto exacto" entra en esta fase).

---

## Preguntas abiertas

- Si el buscador de productos y la búsqueda por click en el grid deben compartir el mismo
  criterio de orden (promo/trending primero) o el buscador puede ordenar distinto (ej. por
  relevancia del texto tipeado) — a resolver en `/plan`.
- Qué pasa con el buscador cuando el carrito ya tiene items y la cajera quiere directamente ir a
  cobrar sin agregar más — si Enter dentro del buscador con texto vacío también debería abrir el
  checkout, o si hace falta sacar el foco del buscador primero (evitar abrir el checkout por
  accidente mientras se tipea un nombre de producto que por casualidad no matchea nada).

---

## Plan técnico

### Enfoque

Feature 100% de frontend, contenida a `VentaSection.tsx` y `useCheckout.ts` (sin tocar backend,
esquema, SSE ni auth — no hay superficie nueva de API). Se agrega un hook nuevo
`useCajaShortcuts` que centraliza los `keydown` listeners de toda la pantalla de venta (patrón ya
usado en `useScannerInput.ts`: listener en `window`, con guardas por `event.target` para no
interferir con inputs de texto), y un componente `ProductSearch` para el buscador con
autocompletar. El resto son ajustes puntuales dentro de `VentaSection.tsx`/`useCheckout.ts`
(hints visuales de tecla en los botones existentes, y sacar el `setTimeout` de 800ms). No hace
falta ningún cambio de datos ni de tipos en `packages/shared`.

### Archivos/módulos afectados

- **`apps/web/src/components/caja/VentaSection.tsx`**
  - Eliminar el `useEffect` con `setTimeout(800)` que gatea `loadingProducts` (líneas ~186-191)
    — `loadingProducts` pasa a `false` de entrada (no hay carga async real acá; `drinks` ya llega
    resuelto por prop desde el shell `CajaClient`).
  - Sumar `<ProductSearch>` arriba del grid (columna de productos), visible en desktop/lg — en
    mobile el buscador convive con el grid táctil existente sin cambios.
  - Montar `useCajaShortcuts` con los callbacks: `onAddDrink` (reusa `addToCart`), `onOpenCheckout`
    (reusa `openCheckout`, solo si `totalItems > 0`), `onSelectMethod` (envuelve
    `setPaymentMethod("efectivo")` / `startPosnetPayment("debito")` / `startPosnetPayment("qr")`,
    solo si `isCheckoutOpen && !paymentMethod`), `onExactAmount` (`handleChangeCash(String(totalPrice))`,
    solo si `paymentMethod === "efectivo"`), `onConfirmCash` (`confirmOrder`, solo si
    `canConfirmCash`), `onNewSale` (mismo handler que el botón "Nueva Venta", solo si `latestOrder`
    truthy).
  - Agregar hints visuales de tecla en los botones del modal de checkout ("1"/"2"/"3" en
    Efectivo/Tarjeta/QR, "Enter" en "Pedido Concretado"/"Nueva Venta") — solo texto/badge, sin
    lógica nueva ahí (la lógica vive en el hook).

- **`apps/web/src/components/caja/ProductSearch.tsx`** (nuevo)
  - Input de texto + lista de resultados filtrados (mismo patrón visual que el buscador de
    `HistorialSection.tsx`). Filtra `drinks` por `name` (client-side, ya están todos en memoria).
  - Maneja su propio estado de índice resaltado y ↑/↓ dentro del componente; expone `onSelect(id)`
    hacia el padre. Enter con un resultado resaltado llama `onSelect`; Enter con la lista vacía no
    hace nada acá (el "Enter abre checkout" es responsabilidad de `useCajaShortcuts`, que ve que
    el foco no está en este input — ver pregunta abierta de la spec, a resolver: mientras el
    buscador tiene foco, Enter solo agrega productos, nunca abre el checkout).

- **`apps/web/src/hooks/useCajaShortcuts.ts`** (nuevo)
  - Hook chico, `window.addEventListener("keydown", ...)` en un único `useEffect`, con cleanup.
  - Guarda: ignora el evento si `event.target` es el input de búsqueda de productos o el input de
    monto en efectivo (excepto Enter, que sí se deja pasar en el input de monto para
    `onConfirmCash` — ya es el comportamiento nativo de un `<input>` dentro de flujo de teclado,
    pero se maneja explícito para evitar submit accidental de formulario).
  - Mapea: `Enter` → `onOpenCheckout` u `onConfirmCash` u `onNewSale` según el estado actual
    (recibe el estado relevante — `isCheckoutOpen`, `paymentMethod`, `latestOrder`,
    `canConfirmCash` — como argumentos para decidir cuál disparar); `1`/`2`/`3` → `onSelectMethod`
    (solo cuando aplica); `" "` (Espacio) → `onNewSale` (solo cuando `latestOrder` truthy, y con
    `preventDefault` para que no haga scroll de la página).
  - Test unitario con Testing Library simulando `keydown` sobre `window`, en línea con
    `VentaSection.test.tsx`/`useCheckout` (si existe) ya en el repo.

- **`apps/web/src/hooks/useCheckout.ts`**: sin cambios de firma — `handleChangeCash`,
  `confirmOrder`, `startPosnetPayment` y `setPaymentMethod` ya son exactamente lo que el hook de
  atajos necesita invocar, se pasan tal cual desde `VentaSection`.

### Cambios de datos

Ninguno. No hay migraciones nuevas, ni cambios en `packages/shared/src/domain.ts`, ni impacto en
el sync local↔cloud (la feature no toca ninguna tabla ni el flujo de `orders`/`cash-sales` más
allá de invocar los mismos handlers que ya existen). Offline-first no se ve afectado: sigue
siendo el mismo `ordersService.create` de siempre.

### Real-time

Ninguno nuevo. Los atajos disparan las mismas acciones (`confirmOrder`, `startPosnetPayment`) que
ya emiten (indirectamente, vía backend) los eventos SSE existentes (`order.created`, etc.) — no
se agrega ni consume ningún evento adicional.

### Auth/permisos

Sin cambios. La pantalla ya está detrás del guard de rol `caja`/`admin` existente
(`proxy.ts` + `auth.middleware.ts`); los atajos solo aceleran acciones que la cajera ya podía
hacer con mouse, no habilitan nada nuevo.

### Riesgos

- **Colisión de atajos con inputs de texto**: si la guarda de `useCajaShortcuts` no excluye bien
  los `INPUT`/`TEXTAREA`, "1"/"2"/"3" podrían interferir con el buscador de productos o el monto
  en efectivo. Mitigación: mismo patrón de guardas de `useScannerInput.ts`, ya probado en el
  repo, más tests unitarios explícitos de "atajo no dispara con foco en input de texto".
- **Doble disparo con Enter**: Enter tiene tres significados posibles según el estado
  (abrir checkout / confirmar efectivo / nueva venta) — si el hook no lee bien el estado actual
  en cada keydown (stale closures), podría ejecutar la acción equivocada. Mitigación: pasar el
  estado relevante como argumentos al hook en cada render (no capturarlo una sola vez), y cubrir
  los 3 casos con tests.
- **Accesibilidad/UX del buscador**: agregar un input que "roba" atención visual en desktop no
  debe romper el flujo táctil en mobile/tablet — se oculta con las mismas breakpoints `lg:` que
  ya separan grid mobile/desktop en `VentaSection.tsx`.
- **Deuda tocada de paso**: el `setTimeout(800)` no tiene tests que dependan de su timing (se
  verificó que `VentaSection.test.tsx` no usa fake timers para ese efecto) — bajo riesgo de
  romper tests existentes al sacarlo, pero se corre la suite completa antes de cerrar.

### Alternativas consideradas

- **Librería de hotkeys (ej. `react-hotkeys-hook`)**: se descartó por ser una dependencia nueva
  para un caso de uso chico (un solo hook, pocos atajos) que ya tiene precedente propio en el
  repo (`useScannerInput.ts`) sin librería externa — consistente con la convención del repo de
  no sumar dependencias para resolver algo que un hook de 40 líneas resuelve.
- **Navegación con flechas sobre el grid en vez de buscador con autocompletar**: evaluada en el
  brainstorming previo y descartada por el usuario — no escala si la carta crece o cambia de
  orden, y el buscador por texto es más directo cuando la cajera ya sabe qué quiere vender.
- **Detección automática de dispositivo (touch vs teclado) para adaptar la UI**: descartada
  explícitamente por el usuario (ver "Fuera de alcance" en la spec) — se prefiere mantener ambos
  modos coexistiendo sin lógica de detección, más simple y sin casos borde de tablets con teclado
  Bluetooth.

---

## Tareas

Frontend puro — no hay migraciones, backend, tipos compartidos ni eventos SSE nuevos que tocar.

### 1. Deuda de latencia (independiente, se puede hacer primero y sola)

- [x] Sacar el `useEffect`/`setTimeout(800)` que gatea `loadingProducts` en
  `apps/web/src/components/caja/VentaSection.tsx` (líneas ~186-191); `loadingProducts` arranca en
  `false`. Confirmar que `VentaSection.test.tsx` sigue en verde (no depende de ese timing).

### 2. Buscador de productos con autocompletar

- [x] Crear `apps/web/src/components/caja/ProductSearch.tsx`: input + lista de resultados
  filtrados por `name` sobre la prop `drinks`, con índice resaltado interno y navegación ↑/↓,
  siguiendo el patrón visual del buscador de `HistorialSection.tsx`. Expone `onSelect(id: number)`.
- [x] Test `ProductSearch.test.tsx`: tipear filtra la lista, ↑/↓ mueve el resaltado, Enter sobre
  el resaltado llama `onSelect` con el id correcto, Enter con lista vacía no llama nada.
- [x] Montar `<ProductSearch>` en `VentaSection.tsx` (columna de productos, solo visible en
  `lg:` — no afecta el grid táctil de mobile), conectado a `addToCart` vía `onSelect`.

### 3. Hook de atajos de teclado

- [x] Crear `apps/web/src/hooks/useCajaShortcuts.ts` siguiendo el patrón de guardas de
  `useScannerInput.ts` (listener único en `window`, ignora `INPUT`/`TEXTAREA`/`isContentEditable`
  salvo las excepciones explícitas del propio flujo de caja). Recibe como argumentos el estado
  necesario para decidir el significado de Enter en cada momento (`isCheckoutOpen`,
  `paymentMethod`, `latestOrder`, `canConfirmCash`, `totalItems`) más los callbacks
  `onOpenCheckout`, `onSelectMethod`, `onExactAmount`, `onConfirmCash`, `onNewSale`.
- [x] Mapeo de teclas dentro del hook: Enter → la acción que corresponda según el estado recibido
  (abrir checkout / confirmar efectivo / nueva venta, nunca más de una a la vez); `1`/`2`/`3` →
  `onSelectMethod("efectivo" | "debito" | "qr")` solo cuando el modal de checkout está abierto y
  sin método elegido todavía; Espacio → `onNewSale` solo cuando hay `latestOrder` (con
  `preventDefault` para no scrollear la página). Tecla `E` → `onExactAmount` (decisión confirmada
  con el usuario durante Plan Mode, no estaba fijada en la spec original).
- [x] Test `useCajaShortcuts.test.tsx` (Testing Library, `fireEvent.keyDown`/`renderHook`): cada
  atajo dispara su callback en el estado correcto y NO dispara en los demás estados; ningún
  atajo dispara si el `target` simulado es un `INPUT`/`TEXTAREA` (salvo Enter en el input de
  monto, que sí debe confirmar); caso explícito anti stale-closure con re-render.

### 4. Cablear los atajos en la pantalla de venta

- [x] En `VentaSection.tsx`, montar `useCajaShortcuts` pasando los callbacks reales: `onOpenCheckout`
  → `openCheckout` (ya existente); `onSelectMethod("efectivo")` → `setPaymentMethod("efectivo")`,
  `onSelectMethod("debito"|"qr")` → `startPosnetPayment(...)` (de `useCheckout`); `onExactAmount`
  → `handleChangeCash(String(totalPrice))`; `onConfirmCash` → `confirmOrder`; `onNewSale` → el
  mismo handler que ya usa el botón "Nueva Venta" existente (extraído a una función `newSale()`
  compartida entre el botón y el atajo).
- [x] Agregar hints visuales de tecla en los botones del modal de checkout ya existentes: "1"/"2"/"3"
  en Efectivo/Tarjeta/QR, "Enter" en "Pedido Concretado" y "Enter / Espacio" en "Nueva Venta" —
  solo texto/badge, sin lógica nueva en el JSX de esos botones.
- [x] Agregar un botón/tecla visible de "Monto exacto (E)" junto al input de monto recibido en
  efectivo (además de operar por teclado), que llama al mismo `onExactAmount`.

### 5. Verificación de punta a punta

- [x] `pnpm typecheck` en verde (api + web).
- [x] Correr la suite completa de `apps/web` (259 tests, 50 archivos) — todo en verde.
- [x] Probado en LAN (dev server real, login como `caja`) con teclado físico y foco real en cada
  input: buscador filtra y suma con Enter, Enter fuera del buscador abre el cobro, 1/2/3
  seleccionan método (hints visibles), tecla `E` respeta la guarda de foco (no dispara con foco en
  el input de monto, solo el botón/click sí), "Monto exacto" carga el total, Enter en el input de
  monto dispara `confirmOrder` (confirmado end-to-end: el backend respondió con el error de
  negocio esperado por no haber noche activa en este entorno, lo que prueba que el atajo llega
  hasta la mutación real). Mouse/click intacto en cada paso probado.
- [ ] (Opcional, no realizado) Delegar a `e2e-playwright-tester` una corrida automatizada del
  flujo de cobro en `/caja` — la verificación manual de esta sesión ya cubrió el camino feliz;
  queda pendiente para cuando arranque formalmente la Fase 4 (E2E).

### 6. Cierre

- [x] Marcar el estado de la spec como `done` en el header de `docs/specs/pulir-ui-caja.md`.
- [x] Actualizar `docs/ROADMAP.md`: tildar los ítems correspondientes de la Fase 5.
- [x] Commits por bloque lógico (deuda de latencia / buscador / hook de atajos / cableado final /
  cierre), sin atribución AI, siguiendo la convención del repo.

---

**Siguiente paso**: implementar. Para el hook de atajos (bloque de mayor riesgo por los estados
de Enter) conviene ir con Plan Mode o al menos tests primero; el resto son cambios chicos y
acotados. Ir tildando `- [x]` a medida que se completa cada tarea.
