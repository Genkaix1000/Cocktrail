# Plan Técnico — Adaptación de Caja para Tablet y Permisos

**Fecha**: 2026-07-13
**Spec de referencia**: [`docs/specs/adaptacion-caja-tablet.md`](../specs/adaptacion-caja-tablet.md)

---

## Enfoque técnico

### 1. Sidebar Colapsable
* **Estado**: Guardaremos el estado `isSidebarCollapsed` en un state local en `CajaClient.tsx` y lo persistiremos usando `localStorage` para recordar la preferencia del usuario entre recargas.
* **Componente**: `CajaSidebar` recibirá `isCollapsed` y una función `onToggleCollapse`. Cuando `isCollapsed` sea `true`, el ancho cambiará de `w-[280px]` a `w-[76px]`, y los elementos ocultarán sus textos (usando clases de Tailwind como `sr-only` o `hidden` condicional) mostrando solo los iconos de forma centrada. El logo de la marca pasará a mostrar solo la versión isotipo/compacta.

### 2. Visibilidad del Botón "Cobrar" y Layout del Carrito
* **Breakpoint**: Cambiaremos el contenedor principal del carrito y grid de productos de `lg:flex`/`lg:hidden` a `md:flex`/`md:hidden` para que la visualización lateral de la lista de productos y carrito esté disponible en pantallas de tablets medianas en horizontal.
* **Layout**: El carrito lateral tendrá una estructura flex vertical (`flex flex-col h-full`). La sección central (`cartEntries`) tendrá la clase `flex-1 overflow-y-auto min-h-0` para hacer scroll interno, mientras que el pie de página (totales + botón "Cobrar") tendrá `shrink-0` asegurando que nunca sea desplazado por el scroll.

### 3. Modal de Checkout Centrado y Grilla de Métodos
* **Posicionamiento**: Cambiaremos el contenedor del modal de checkout en `VentaSection.tsx` de `items-end` (bottom sheet) a `items-center justify-center p-4` en todos los viewports para centrarlo de forma absoluta.
* **Alineación**: Centraremos el "Total a cobrar" en el modal de selección de método de pago.
* **Grilla**: Reemplazaremos los dos botones apilados por una grilla responsiva de dos columnas (`grid grid-cols-2 gap-4`) con botones grandes que contengan el icono centrado en la parte superior y la etiqueta abajo.

### 4. Input Autoscale, Numpad y Enter
* **Autoscale**: Crearemos una función de cálculo dinámico para el tamaño de fuente del input de efectivo basándonos en la longitud de `displayCashValue`. 
  Ejemplo:
  ```typescript
  const getFontSizeClass = (val: string) => {
    const len = val.length;
    if (len <= 5) return "text-4xl";
    if (len <= 8) return "text-2xl";
    return "text-lg";
  };
  ```
  Esto se aplicará a la clase del input de efectivo para evitar desbordes.
* **Numpad**: Agregaremos `inputMode="numeric"` y `pattern="[0-9]*"` al `<input>` de efectivo para forzar la apertura del teclado numérico en iOS/Android.
* **Confirmación por Enter**: En el input, agregaremos un manejador `onKeyDown`:
  ```typescript
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (canConfirmCash && !submitting) {
        confirmOrder();
      }
    }
  };
  ```
* **Layout Adaptable**: Usaremos unidades de viewport dinámicas (`max-h-[90dvh]` o `max-h-[calc(100dvh-2rem)]`), gaps pequeños (`gap-3`) y envolveremos los instructivos y advertencias en un contenedor scrollable si la pantalla es muy pequeña. Los tres componentes clave (Total, Recibido, Vuelto) estarán fijos o dimensionados de forma que no se colapsen ni pierdan tamaño.

### 5. Pantalla de Bloqueo de Caja y Apertura de Noche
* **Control de Acceso**: En `CajaClient.tsx`, si `event === null` o `event.status !== "activo"`, no renderizaremos la estructura normal de tabs. En su lugar, mostraremos una vista centrada `"Caja Cerrada"`.
* **Formulario de Apertura**: Si el usuario es `admin` o su rol es `caja` y tiene el permiso `openNight === true`, mostraremos un formulario para ingresar la palabra clave (keyword) y un botón de "Abrir Noche" que llamará al endpoint `POST /api/events/open` para activar la noche en vivo (vía SSE). Si no tiene permiso, la pantalla mostrará una advertencia instructiva.
* **Visibilidad de Keyword**: Cuando la noche esté abierta, mostraremos la keyword en la parte superior del sidebar (debajo del logo) o en el OSHeadbar (ej. badge `Clave: XXXXX`).

### 6. Permiso Granular `openNight` en Backend y Base de Datos
* **Base de Datos**: La tabla `users` usa la columna `permissions JSONB`. No requiere migraciones de base de datos porque es un esquema flexible JSONB.
* **Backend (`apps/api`)**:
  * Modificar el tipo `UserPermissions` en `apps/api/src/modules/users/users.repository.ts` para incluir `openNight: boolean`.
  * Modificar `SYSTEM_USERS` en `apps/api/src/modules/users/users.service.ts` para agregar `openNight` (`true` para admin, `false` para otros).
  * Modificar los esquemas Zod `CreateUserSchema` y `UpdateUserSchema` en `apps/api/src/shared/middleware/validate.ts` para incluir y validar `openNight`.
  * Modificar `router.post("/events/open")` en `apps/api/src/modules/events/events.controller.ts` para permitir roles `"admin"` y `"caja"`. Si es `"caja"`, verificar que `permissions.openNight` sea `true` en la base de datos (igual que se hace con `closeNight`).
* **Frontend (`apps/web`)**:
  * Modificar el tipo `UserPermissions` en `apps/web/src/services/users.service.ts`.
  * Actualizar `usuariosConstants.ts` para incluir `openNight` en etiquetas, permisos por rol y estado inicial.

---

## Archivos afectados

### Backend (API)
* `apps/api/src/modules/users/users.repository.ts` [MODIFY]
* `apps/api/src/modules/users/users.service.ts` [MODIFY]
* `apps/api/src/shared/middleware/validate.ts` [MODIFY]
* `apps/api/src/modules/events/events.controller.ts` [MODIFY]

### Frontend (Web)
* `apps/web/src/services/users.service.ts` [MODIFY]
* `apps/web/src/components/settings/usuariosConstants.ts` [MODIFY]
* `apps/web/src/components/settings/UserFormDrawer.tsx` [MODIFY]
* `apps/web/src/components/caja/Sidebar.tsx` [MODIFY]
* `apps/web/src/app/caja/CajaClient.tsx` [MODIFY]
* `apps/web/src/components/caja/VentaSection.tsx` [MODIFY]

---

## Verificación del Plan

### Pruebas Automatizadas
* Ejecutar la suite de tests de backend: `pnpm --filter cocktrail-api test` para verificar que las modificaciones de usuarios y eventos no rompen los tests de integración/unitarios existentes.
* Ejecutar la suite de tests de frontend: `pnpm --filter cocktrail-web test` para asegurar que los componentes de caja y usuarios se comporten correctamente.

### Verificación Manual
* Entrar a `/caja` con la noche cerrada y confirmar que se bloquea la pantalla.
* Intentar abrir la noche con un usuario cajero sin el permiso `openNight` (confirmar que falla/no muestra el botón).
* Otorgar el permiso `openNight` al cajero desde `/admin -> Usuarios`, entrar a `/caja`, abrir la noche con una palabra clave, y confirmar que se abre exitosamente.
* Verificar el colapso del sidebar en `/caja` y su persistencia.
* Cargar un pedido largo, verificar que el botón "Cobrar" permanece fijo al final.
* Abrir el modal de checkout, confirmar que está centrado, que tiene el diseño de grilla para los métodos de pago, y que el input de efectivo tiene autoscale, input numérico y responde a la tecla Enter.
