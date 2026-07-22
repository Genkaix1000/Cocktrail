# Adaptación de Caja para Tablet y Permisos

**Estado**: draft
**Fecha**: 2026-07-13
**Diseño/Plan**: [`docs/plans/05-ui-caja/2026-07-13-adaptacion-caja-tablet-design.md`](../../plans/05-ui-caja/2026-07-13-adaptacion-caja-tablet-design.md)

---

## Problema / Por qué
La terminal de `/caja` fue diseñada inicialmente para pantallas grandes de escritorio y operación mediante teclado físico. Al migrar la operación a una tablet (táctil, pantalla mediana), surgen varios problemas de usabilidad y control:
1. **Espacio limitado**: El sidebar fijo de la izquierda (`w-[280px]`) ocupa demasiado espacio útil en pantallas de tablet medianas, reduciendo el grid de productos.
2. **Scrolling innecesario para cobrar**: El botón de "Cobrar" en el carrito del sidebar puede quedar oculto bajo scroll si hay muchos productos, demorando el checkout.
3. **Checkout incómodo**: El popout de cobro aparece abajo como una "bottom sheet" de celular, lo cual resulta estéticamente desproporcionado y poco ergonómico en el centro de una tablet. Además, los métodos de pago están apilados verticalmente y no aprovechan el ancho de pantalla.
4. **Ingreso numérico ineficiente**: Al cobrar en efectivo, se abre el teclado alfabético estándar en lugar del numérico (numpad). La visualización del total recibido y el vuelto es pequeña y el teclado virtual a menudo tapa los totales del vuelto o reduce el tamaño de forma desorganizada.
5. **Falta de control operacional**: Cualquiera en la terminal puede interactuar con la caja incluso si la noche/caja no ha sido abierta por el administrador, lo que puede provocar transacciones huérfanas.
6. **Permisos rígidos**: Solo los usuarios con rol `admin` pueden abrir la noche (abrir caja). En la operación real, a veces es necesario delegar la apertura de la noche/caja a un cajero de confianza (rol `caja`) sin otorgarle privilegios de administrador total.

## Objetivo
Optimizar la terminal de caja para una experiencia táctil y fluida en tabletas, permitiendo replegar el sidebar, garantizando que el botón de cobro y los totales de vuelto estén siempre visibles y centrados, y agregando control de apertura de caja basado en un nuevo permiso granular `openNight`.

## Criterios de aceptación
1. **Given** la terminal de `/caja` en desktop o tablet, **when** se hace click en el botón de colapsar, **then** el sidebar se contrae a una versión compacta (solo iconos, `w-[80px]`) y el estado se persiste en `localStorage`.
2. **Given** el carrito de compra en el lateral derecho de `/caja`, **when** hay más productos de los que entran en pantalla, **then** la lista de productos tiene scroll interno, pero el pie de página con el total y el botón "Cobrar" se mantienen fijos y siempre visibles.
3. **Given** que se presiona "Cobrar", **when** se abre el modal de checkout, **then** se renderiza en el centro exacto de la pantalla (centrado absoluto) con un diseño bento-like, y la selección de método de pago muestra una grilla de dos columnas iguales ("Efectivo" y "Tarjeta") con iconos grandes.
4. **Given** la pantalla de pago en efectivo, **when** se ingresa el monto, **then** el input se auto-escala dinámicamente (la fuente se reduce si el texto es muy largo) y está centrado, y el foco abre automáticamente el teclado numérico (`inputmode="numeric"`) en dispositivos táctiles.
5. **Given** la pantalla de pago en efectivo, **when** el usuario presiona la tecla "Enter" (física o del teclado virtual de la tablet), **then** se procesa y concreta la venta inmediatamente si el monto recibido es válido.
6. **Given** la apertura del teclado virtual en la tablet, **when** se está cobrando en efectivo, **then** el layout del modal se adapta de manera fluida (usando `dvh`, scrollbox interno y gaps flexibles) para seguir mostrando el total a pagar, el recibido y el vuelto a entregar sin perder tamaño crítico ni desbordar la pantalla.
7. **Given** que un usuario entra a `/caja`, **when** la noche no está activa (`event === null`), **then** se bloquea la interfaz de venta/historial/métricas y se muestra una pantalla de bloqueo "Caja Cerrada".
8. **Given** la pantalla de bloqueo de caja, **when** el usuario tiene el rol `admin` o el permiso `openNight` activado, **then** visualiza un botón para "Abrir Noche" que abre el formulario para ingresar la palabra clave y activar la noche directamente desde `/caja`. Si no tiene el permiso, solo ve un mensaje instructivo para pedirle al administrador.
9. **Given** que la noche está activa, **when** se abre el sidebar (desplegado) o se mira la cabecera, **then** la palabra clave (keyword) de la noche activa se muestra visible para que el cajero pueda consultarla.
10. **Given** la pestaña de Administración de Usuarios en `/admin`, **when** se crea o edita un usuario, **then** se muestra la opción de otorgar el permiso "Abrir la noche/caja" (`openNight`) para roles `admin` y `caja`.

---

## Tareas
*(A ser completadas en la fase de Planificación y Ejecución)*
