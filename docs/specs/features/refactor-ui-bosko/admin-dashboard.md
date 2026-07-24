# Admin dashboard — shell Bosko (topbar + sidebar)

**Estado**: `done`  
**Fecha**: 2026-07-24  
**Padre**: [`refactor-ui-bosko.md`](./refactor-ui-bosko.md)  
**Design system**: [`docs/design/design.md`](../../../design/design.md) §§4.1, 4.2, 4.10  
**Referencias**: [light](../../../design/reference/bosko-light.png) · [dark](../../../design/reference/bosko-dark.png)

---

## Problema / Por qué

El shell de `/admin` hoy mezcla jerarquías de nav (Monitoreo suelto + accordions Operación/Configuración),
mete perfil + logout + abrir/cerrar noche en un footer apretado, y la headbar solo muestra un badge
de pantalla + reloj — lejos del chrome limpio del skin Bosko (topbar con ubicación + usuario;
sidebar con secciones claras; CTA de noche como card destacada abajo).

---

## Objetivo

Rediseñar **solo el chrome** de `/admin` (tokens del tema + topbar + sidebar + night CTA) según
Bosko, sin tocar aún el contenido del Dashboard (KPIs/charts → Fase 2).

Los bloques reutilizables (Topbar, Sidebar nav, NightActionCard, botones base) **quedan
documentados en [`docs/design/`](../../../design/)** e implementados como componentes compartidos
para que `/caja` y el resto no reinventen el chrome.

---

## Decisiones de producto (cerradas)

| Tema | Decisión | Por qué |
|---|---|---|
| Search en topbar | **Omitir** | No hay búsqueda global; un input decorativo confunde. |
| Mail / notificaciones | **Omitir** | Sin feature detrás. |
| Enrutado | **Mantener** | Breadcrumb / ubicación activa a la izquierda de la topbar (evoluciona el rol actual de `OSHeadbar` + `breadcrumbs` de `AdminClient`). |
| Logo sidebar | Color **`--text-primary`** (casi negro en light, claro en dark) | Chrome quieto; el acento se reserva para activo/CTAs/KPI. Logo Bosko centrado arriba. |
| Perfil | **Topbar derecha**, no footer del sidebar | Nombre (SemiBold) + icono acento; debajo rol (Regular, secondary) + icono de rol. |
| Logout | Ítem en sección **GENERAL** del sidebar | Misma lógica que la referencia (acción de sesión en nav inferior), no escondido solo en el footer. |
| Ayuda | **No** en esta fase | YAGNI hasta tener contenido. |
| Sistema | Pasa a **GENERAL** (junto a Cerrar sesión) | Separa “config del negocio” de “mantenimiento / sesión”. |
| Abrir / cerrar noche | **Night action card** al pie del sidebar | Mismo diseño de card destacada del mock; contenido = CTA de noche (no “download app”). |

---

## Historias de usuario

- Como **admin**, quiero ver en la topbar **dónde estoy** y **quién soy** (nombre + rol) de un vistazo.
- Como **admin**, quiero un menú con secciones claras (operación vs configuración vs general) sin accordions confusos.
- Como **admin**, quiero abrir o cerrar la noche desde una card clara al pie del menú, no desde botones sueltos mezclados con el perfil.
- Como **admin**, quiero cerrar sesión desde GENERAL, como el resto de acciones de sesión.

---

## Criterios de aceptación

### Topbar

1. **Given** cualquier tab de `/admin`, **when** cargo la pantalla, **then** la topbar muestra a la izquierda el enrutado activo (breadcrumb o equivalente legible, p. ej. `Administración / Dashboard`).
2. **Given** un usuario logueado, **then** a la derecha ve: icono minimalista en color acento + **nombre** (peso fuerte) y debajo **rol** (peso/color secundario) con icono de rol.
3. **Given** la topbar, **then** no hay search, mail ni campana de notificaciones.
4. **Given** light y dark, **then** tipografía y colores respetan `design.md` §4.2.

### Sidebar

5. **Given** el sidebar, **then** el logo Bosko está arriba centrado en `--text-primary` (no forzar fill de acento).
6. **Given** el menú, **then** las secciones son exactamente:

   ```
   MENU
     Dashboard
     Historial de Noches
     Auditoría de Tickets

   CONFIGURACIÓN
     Carta
     Gestión de Staff
     Pagos
     PDV y Posnets

   GENERAL
     Sistema
     Cerrar sesión
   ```

7. **Given** el ítem activo, **then** usa el tratamiento de acento del design system (surface / barra / texto).
8. **Given** “Cerrar sesión”, **then** ejecuta el mismo flujo de logout que hoy (`OSProfileFooter` / `authService`), con confirmación si ya existía.
9. **Given** el sidebar, **then** ya no depende de accordions colapsables Operación/Configuración para la jerarquía principal (secciones estáticas con headers uppercase).

### Night action card

10. **Given** noche **abierta**, **then** al pie del sidebar hay una card estilo widget especial (§4.10) con CTA primario **Cerrar noche** (abre `CloseNightModal`); puede incluir acceso a **Clave de la noche**.
11. **Given** noche **cerrada** o ausente, **then** la card usa variante visual distinta (misma familia) con CTA **Abrir noche** (abre `OpenNightModal` con palabra clave).
12. **Given** ambas variantes, **then** no hay botones danger/green sueltos apilados como hoy; el CTA vive dentro de la card.

### Shared → design

13. **Given** Topbar, ítems de Sidebar y NightActionCard, **then** están documentados en `docs/design/design.md` y no son estilos one-off solo dentro de `AdminClient`.
14. **Given** esta fase, **then** el contenido de `DashboardSection` (KPIs, charts) puede quedar con look legacy o mínimamente envuelto — el restyle de métricas es Fase 2.

---

## Fuera de alcance

- Cambiar métricas, analytics o tabs de settings por dentro.
- Implementar search, mail, notificaciones, Ayuda.
- Migrar `/caja` (reutilizará estos componentes después).
- Reloj en topbar: opcional; si estorba al layout Bosko, se puede mover a Sistema o eliminar (no bloqueante).

---

## Plan técnico (alto nivel)

Al implementar (plan detallado en `docs/plans/` cuando se arranque código):

1. Tokens Bosko en `globals.css` + ThemeProvider light/dark (retirar look crema/botella del shell admin).
2. Extraer / reescribir:
   - `OSHeadbar` → Topbar (enrutado + UserChip nombre/rol).
   - Sidebar nav (secciones fijas) en componente compartido.
   - `NightActionCard` (estados open/closed).
3. `AdminClient`: cablear tabs a la nueva jerarquía; logout desde GENERAL; quitar `OSProfileFooter` del pie (o dejar solo theme toggle si no cabe en topbar/Sistema).
4. Tests existentes de `AdminClient` / headbar: actualizar selectores y asserts de labels (`Monitoreo` → `Dashboard` si se renombra el label visible).

### Archivos tocados (previstos)

- `apps/web/src/app/globals.css`
- `apps/web/src/components/ThemeProvider.tsx`
- `apps/web/src/app/admin/AdminClient.tsx`
- `apps/web/src/components/shared/OSHeadbar.tsx` (o reemplazo `AppTopbar`)
- `apps/web/src/components/shared/OSProfileFooter.tsx` (retiro/reducción)
- Nuevos: p. ej. `AppSidebar`, `NightActionCard`, `UserChip` bajo `components/shared/`

---

## Tareas

- [x] Tokens + tema Bosko aplicados al shell admin
- [x] Topbar: enrutado + toggle día/noche + UserChip (nombre/rol); sin search/mail/bell
- [x] Sidebar: logo `--text-primary` + secciones MENU / CONFIGURACIÓN / GENERAL
- [x] Logout en GENERAL
- [x] NightActionCard abierta / cerrada
- [x] Perfil fuera del footer del sidebar
- [x] Documentación de componentes compartidos al día en `docs/design/design.md`
- [x] Tests del shell admin en verde

---

## Referencias de código hoy

- Shell: `apps/web/src/app/admin/AdminClient.tsx` (`renderSidebar`, `breadcrumbs`)
- Headbar: `apps/web/src/components/shared/OSHeadbar.tsx`
- Perfil/logout: `apps/web/src/components/shared/OSProfileFooter.tsx`
- Logo: `apps/web/src/components/shared/BrandLogo.tsx`
- Modales: `OpenNightModal`, `CloseNightModal`
