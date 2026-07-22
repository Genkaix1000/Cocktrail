# Acceso al panel /admin sin noche activa

**Estado**: done
**Fecha**: 2026-07-10

---

## Problema / Por qué

Hoy, si un admin entra a `/admin` y no hay una noche activa (`night_events` sin fila
`status: 'activo'`), el panel **entero** queda inaccesible: `AdminClient.tsx` hace un
`return` temprano que reemplaza todo el layout (sidebar, Dashboard, Historial de Noches,
Configuración, Gestión de Staff, Mercado Pago) por una única pantalla de pantalla completa con
el formulario "Abrir Noche". No hay forma de ver nada del panel sin abrir una noche primero.

Esto es ineficiente para casos de uso legítimos donde el admin **no quiere abrir una noche
todavía** — por ejemplo, entrar a revisar el Historial de noches anteriores, chequear/editar la
Carta, ajustar la configuración de Mercado Pago, o dar de alta un usuario de staff antes de que
arranque el turno. Ninguna de esas tareas necesita una noche activa, pero hoy todas quedan
bloqueadas por el mismo gate.

**Para quién**: el dueño del boliche (rol `admin`).

---

## Objetivo

Que el panel `/admin` sea navegable por completo (sidebar + todas las secciones) exista o no una
noche activa. Abrir una noche pasa a ser una acción explícita disponible desde el sidebar (un
botón "Abrir noche", simétrico al "Cerrar noche" que ya existe), no un paso obligatorio para
entrar al panel.

Además, al abrir una noche, el admin puede elegir entre escribir la palabra clave a mano (como ya
funciona hoy) o generar una automáticamente con un botón, sin tener que pensar una él mismo.

---

## Historias de usuario

- Como **admin**, quiero entrar a `/admin` y ver el Dashboard/Historial/Configuración aunque no
  haya ninguna noche activa, para poder revisar datos o ajustar cosas sin verme forzado a abrir
  un turno.
- Como **admin**, quiero un botón "Abrir noche" visible en el sidebar cuando no hay noche activa
  (en el mismo lugar donde hoy aparece "Cerrar noche" cuando sí la hay), para abrir el turno
  cuando yo decida, no como paso obligatorio de entrada.
- Como **admin**, quiero poder generar la palabra clave de la noche con un botón en vez de
  tener que inventar una cada vez, para ahorrar ese pequeño esfuerzo repetitivo cada turno.
- Como **admin**, quiero poder seguir escribiendo mi propia palabra clave si prefiero una en
  particular, para no perder el control sobre algo que se comunica al staff.

---

## Criterios de aceptación

1. **Given** no hay ninguna noche activa, **when** el admin entra a `/admin`, **then** ve el
   panel completo (sidebar con todas las secciones, Dashboard, etc.) — no una pantalla de
   bloqueo con el formulario de abrir noche como única opción.
2. **Given** no hay noche activa, **when** el admin mira el sidebar, **then** ve un botón
   "Abrir noche" en el mismo lugar donde hoy aparece "Cerrar noche" cuando sí hay una noche
   activa.
3. **Given** hay una noche activa, **when** el admin mira el sidebar, **then** sigue viendo
   "Clave de la noche" y "Cerrar noche" exactamente como hoy — el botón "Abrir noche" no
   aparece (no puede haber dos noches activas a la vez, la protección ya existe en el backend).
4. **Given** el admin hace click en "Abrir noche", **when** se abre el formulario, **then** es
   un modal superpuesto sobre el panel (no una pantalla que tapa todo) — el resto del panel
   sigue visible detrás, igual que pasa hoy con "Cerrar noche".
5. **Given** el formulario de abrir noche está abierto, **when** el admin escribe una palabra
   clave a mano y confirma, **then** la noche se abre exactamente igual que el comportamiento
   actual (sin cambios en ese camino).
6. **Given** el formulario de abrir noche está abierto, **when** el admin toca el botón de
   generar palabra random, **then** el campo de texto se completa con una palabra real en
   español de una lista curada temática (boliche/noche/fiesta) — el admin puede editarla antes
   de confirmar, o generar otra si no le gusta.
7. **Given** el admin ya abrió la noche (a mano o con la random), **when** confirma, **then** el
   panel refleja el nuevo estado activo normalmente (Dashboard en vivo, botones "Clave de la
   noche"/"Cerrar noche" aparecen, "Abrir noche" desaparece) — mismo comportamiento post-abrir
   que existe hoy.
8. **Given** no hay noche activa y el admin navega a cualquier sección del panel (Historial,
   Configuración, Staff, Mercado Pago, Carta), **then** cada sección funciona razonablemente sin
   una noche activa — sin crashear ni mostrar datos corruptos/confusos. (El detalle de qué
   ajustar en cada sección se resuelve en `/plan`.)

---

## Fuera de alcance

- Cambios al backend (`POST /api/events/open`, validaciones de `openEvent()`) — la palabra
  clave random pasa por el mismo endpoint y las mismas reglas que una escrita a mano, sin
  cambios de contrato.
- Cambios al flujo de **cerrar** noche (`CloseNightModal`) — sigue exactamente igual.
- Restringir o cambiar qué puede hacer un admin sin noche activa más allá de sacar el bloqueo de
  navegación — no se agregan permisos nuevos ni se quitan los existentes.
- Un editor de la lista de palabras random desde la UI — la lista queda hardcodeada en el
  código, curarla es tarea de desarrollo, no una feature de configuración para el usuario.
- Tocar `/caja` o `/barra` — ambas pantallas ya manejan "sin noche activa" rechazando ventas con
  un mensaje claro (comportamiento existente, no se toca).

---

## Preguntas abiertas

Resueltas en el plan técnico (ver abajo):
- Auditoría de qué secciones dependen de `event` — hecha, alcance mínimo confirmado.
- Lista de palabras random — lista chica curada, sin repetir la anterior en la misma sesión del
  modal.
- El botón de generar no autocompleta solo — el admin lo toca explícitamente (el input arranca
  vacío como hoy, consistente con "elijo yo, a mano o generada").

---

## Plan técnico

### Enfoque

Cambio acotado y de bajo riesgo: sacar el `if (!event) return ...` bloqueante de
`AdminClient.tsx`, agregar guards defensivos en los dos lugares que hoy asumen `event` no-nulo,
sumar un botón "Abrir noche" simétrico al de "Cerrar noche" en el sidebar, y agregar un generador
de palabra random (lista curada en español) al `OpenNightModal` existente. No se toca backend,
esquema, ni el contrato de `POST /api/events/open` — la palabra random pasa por el mismo campo de
texto y el mismo submit que una escrita a mano.

Auditoría ya hecha (agente Explore, sesión de `/plan`): de todos los componentes del panel
(`DashboardSection`, `HistorialSection`, `LogsSection`, `CartaSection`, `PagosSection`,
`UsuariosSection`), **ninguno recibe `event` como prop** — todos reciben datos ya derivados
(`totals`, `analytics`, `historyEvents`, etc.) calculados en `AdminClient` con defaults seguros
(`orders`/`cashSales` en `[]` cuando no hay evento). Los únicos dos puntos inseguros están
dentro del propio `AdminClient.tsx`.

### Archivos/módulos afectados

- **`apps/web/src/app/admin/AdminClient.tsx`**:
  - Eliminar el bloque `if (!event) { return <main>...<OpenNightModal mode="open" .../></main>; }`
    (líneas ~465-471) — el árbol completo (`renderSidebar` + secciones) pasa a renderizar siempre.
  - En `renderSidebar()`, junto al bloque `{event?.status === "activo" && (...)}` (líneas
    432-457, botones "Clave de la noche"/"Cerrar noche"), agregar el caso espejo:
    `{(!event || event.status !== "activo") && (<button onClick={() => setOpenNightOpen(true)}>Abrir noche</button>)}`
    con el mismo patrón visual (icono `Power` o `KeyRound` invertido en color positivo, ej.
    `bg-green-soft border-green-line text-green`, para diferenciarlo visualmente de "Cerrar
    noche" que usa rojo/`danger`).
  - Nuevo estado `const [openNightOpen, setOpenNightOpen] = useState(false)` (reemplaza el uso
    implícito que hacía el `if (!event)` de "siempre mostrado").
  - Nuevo render condicional junto a los otros dos modales (`editKeywordOpen`/`modalOpen`,
    líneas 476-493): `{openNightOpen && <OpenNightModal mode="open" onClose={() =>
    setOpenNightOpen(false)} onSubmit={(ev) => { setEvent(ev); setOpenNightOpen(false); }} />}`.
  - Guards defensivos: `{editKeywordOpen && event && (<OpenNightModal ... currentKeyword=
    {event.keyword} />)}` y `{modalOpen && event && (<CloseNightModal ... startedAt=
    {event.startedAt} />)}` — hoy son alcanzables solo si `event` existe (los botones que los
    disparan ya están detrás de `event?.status === "activo"`), pero dejan de estar
    estructuralmente garantizados una vez se saca el gate global, así que se blindan explícito.

- **`apps/web/src/lib/randomKeyword.ts`** (nuevo): constante `NIGHT_KEYWORDS: string[]` (lista
  curada de ~20-30 palabras temáticas boliche/noche/fiesta en mayúsculas, ej. "MEDIANOCHE",
  "TEQUILA", "NEON", "ANTRO", "FIESTA", "BOLICHE", "DESVELO", "RESACA", etc. — tono coherente
  con que se imprime en tickets físicos) y función `getRandomKeyword(exclude?: string): string`
  que devuelve una palabra al azar, evitando repetir `exclude` si se pasa (para que tocar el
  botón dos veces seguidas no devuelva la misma palabra la mayoría de las veces).

- **`apps/web/src/components/admin/OpenNightModal.tsx`**:
  - Solo en `mode === "open"` (no en `"edit"` — editar una clave existente es una corrección
    puntual, no tiene sentido "randomizarla"): agregar un botón secundario junto al input,
    "Generar palabra" (ícono `Shuffle` o `Dices` de `lucide-react`), que llama
    `setKeyword(getRandomKeyword(keyword))` — no dispara submit, el admin sigue teniendo que
    confirmar, y puede editar el resultado a mano antes de enviarlo.
  - Sin cambios en `handleSubmit`, validación, ni las llamadas a `eventsService` — la palabra
    generada viaja por el mismo campo `keyword` que una tipeada.

- **`apps/web/src/components/admin/OpenNightModal.test.tsx`** (si no existe, crear; si existe,
  extender): test del nuevo botón — click en "Generar palabra" completa el input con una palabra
  de la lista curada; el submit sigue funcionando igual con una palabra generada.

- **`apps/web/src/app/admin/AdminClient.test.tsx`** (si existe — confirmar en `/tasks`): agregar
  caso "renderiza el panel completo con sidebar cuando no hay noche activa" y "muestra el botón
  Abrir noche en vez de Clave de la noche/Cerrar noche cuando `event` es null".

### Cambios de datos

Ninguno. No hay migraciones, ni cambios en `packages/shared/src/domain.ts`, ni impacto en el
sync local↔cloud — la palabra clave sigue viajando por el mismo `POST /api/events/open` sin
cambios de contrato ni de validación en el backend.

### Real-time

Sin cambios. El evento SSE `event.opened` (consumido por `useEventState.ts`) ya actualiza
`event` en todos los clientes conectados cuando se abre una noche, sea con palabra manual o
generada — no hay diferencia en ese flujo.

### Auth/permisos

Sin cambios. Sigue siendo una acción exclusiva de `admin` (`POST /api/events/open` ya requiere
ese rol en el backend); el nuevo botón "Abrir noche" en el sidebar solo es alcanzable dentro de
`/admin`, que ya está gateado por rol a nivel de ruta.

### Riesgos

- **Los dos guards defensivos son el único punto realmente sensible** — si se olvida agregar
  `event &&` en `editKeywordOpen`/`modalOpen` y por algún bug de UI esos estados quedan en
  `true` sin `event`, crashea. Mitigación: agregarlos como parte del mismo commit que saca el
  gate, no después; cubrir con el test nuevo de `AdminClient.test.tsx`.
  Elegido comportamiento: los criterios de aceptación 1-3 requieren que el resto del panel se
  itere sin sorpresas — ya confirmado por la auditoría, así que el riesgo real es acotado a esos
  dos puntos.
- **Confusión visual entre "Abrir noche" (verde/positivo) y "Cerrar noche" (rojo/`danger`)**:
  bajo, ya que nunca coexisten (uno u otro según `event?.status`).
- **Lista de palabras hardcodeada**: si se agota el "buen gusto" de la lista con el tiempo, hay
  que tocar código para ampliarla — aceptado a propósito (ver "Fuera de alcance" de la spec, no
  se construye un editor de la lista).

### Alternativas consideradas

- **Generar la palabra random en el backend** (nuevo endpoint o parámetro en `POST
  /api/events/open`): descartado — no hay ninguna razón para que el backend decida la palabra,
  es puramente una comodidad de UI; generarla en el cliente evita una llamada de red extra y
  mantiene el backend sin cambios.
- **Palabra alfanumérica tipo `generateTicketCode`** (backend, `tickets.crypto.ts`): descartada
  por decisión explícita del usuario — quiere palabras reales en español, no códigos.
- **Modal "Abrir noche" como pantalla completa en vez de overlay** (mantener el estilo actual):
  descartado — el objetivo central de la spec es justamente que el panel quede visible detrás,
  igual que ya pasa con "Cerrar noche" y "Editar clave".

---

## Tareas

### 1. Generador de palabra random

- [x] Crear `apps/web/src/lib/randomKeyword.ts`: constante `NIGHT_KEYWORDS` (lista curada de
  ~20-30 palabras en mayúsculas, temática boliche/noche/fiesta) y función
  `getRandomKeyword(exclude?: string): string` que devuelve una palabra al azar evitando repetir
  `exclude` si se pasa.
- [x] Test `apps/web/src/lib/randomKeyword.test.ts`: devuelve una palabra de la lista; con
  `exclude` pasado, nunca devuelve esa misma palabra si la lista tiene más de una opción; sin
  `exclude`, puede devolver cualquiera (no crashea con lista de 1 elemento como caso límite).

### 2. Botón "Generar palabra" en OpenNightModal

- [x] En `apps/web/src/components/admin/OpenNightModal.tsx`, agregado (solo en `mode === "open"`)
  un botón secundario junto al input de la palabra clave, ícono `Dices` de `lucide-react`, texto
  "Generar palabra", que llama `setKeyword(getRandomKeyword(keyword))` sin disparar submit.
- [x] Extendido `apps/web/src/components/admin/OpenNightModal.test.tsx`: click en "Generar
  palabra" completa el input con una palabra de `NIGHT_KEYWORDS`; el botón no aparece en
  `mode="edit"`; después de generar, el submit sigue funcionando igual. **Hallazgo en el
  camino**: envolver el botón nuevo dentro del mismo `<label>` que el input rompía el cálculo del
  nombre accesible (el botón "heredaba" el texto del label) — se cambió a asociación explícita
  `htmlFor`/`id`.
- [x] `pnpm --filter cocktrail-app exec vitest run src/components/admin/OpenNightModal.test.tsx
  src/lib/randomKeyword.test.ts` en verde (9 + 5 tests).

### 3. Sacar el bloqueo total del panel

- [x] En `apps/web/src/app/admin/AdminClient.tsx`, eliminado el bloque
  `if (!event) { return <main>...<OpenNightModal mode="open" .../></main>; }`.
- [x] Agregado `const [openNightOpen, setOpenNightOpen] = useState(false)`.
- [x] Agregado el guard defensivo `event &&` a `{editKeywordOpen && event && (...)}` y
  `{modalOpen && event && (...)}`.
- [x] Agregado el render de `{openNightOpen && <OpenNightModal mode="open" .../>}` junto a los
  otros dos modales. `pnpm --filter cocktrail-app exec tsc --noEmit` confirmó que no queda ningún
  otro uso no-blindado de `event.algo` en el archivo (grep manual también lo confirmó).

### 4. Botón "Abrir noche" en el sidebar

- [x] En `renderSidebar()`, agregado el caso espejo `{(!event || event.status !== "activo") &&
  (...)}` con el botón "Abrir noche" (ícono `Power`, estilo `bg-green-soft border-green-line
  text-green` — verde para diferenciarlo del "Cerrar noche" en rojo/`danger`), que hace
  `setOpenNightOpen(true)`.

### 5. Tests de AdminClient

- [x] Creado `apps/web/src/app/admin/AdminClient.test.tsx` (nuevo): panel completo con `event`
  null; botón "Abrir noche" en vez de "Clave de la noche"/"Cerrar noche" y viceversa según el
  estado; flujo completo de abrir una noche desde el sidebar actualiza el panel. Las secciones
  pesadas (Dashboard, Historial, Carta, Pagos, Staff, Logs) se stubean con `vi.mock` — el foco es
  el gating, no el contenido interno de cada una.
- [x] `pnpm --filter cocktrail-app exec vitest run src/app/admin/AdminClient.test.tsx` en verde
  (4 tests).

### 6. Verificación de punta a punta

- [x] `pnpm typecheck` en verde (api + web).
- [x] Suite completa de `apps/web` en verde (299 tests, 54 archivos, sin regresiones).
- [x] Prueba manual en vivo (Playwright contra el dev server real): entré a `/admin` sin noche
  activa → panel completo visible con "Abrir noche" en el sidebar → navegué a Historial y Carta
  sin crashes → click en "Abrir noche" → modal se abrió como overlay con la Carta visible detrás
  → "Generar palabra" completó "TERCIOPELO" → confirmé → sidebar pasó a mostrar "Clave de la
  noche"/"Cerrar noche", "Abrir noche" desapareció, seguí parado en la sección Carta (no perdí el
  lugar). Limpié la noche de prueba con `db:reset --target=local` al terminar.
- [x] El flujo de **cerrar** noche no se tocó — el guard `event &&` es no-op cuando `event`
  existe (siempre que ese modal está abierto), y ya se validó extensamente en la sesión previa de
  `activar-sync-cloud`.

### 7. Cierre

- [x] Estado de esta spec pasa a `done`.
- [x] `docs/ROADMAP.md` actualizado con una línea en "Fase actual" (ver abajo).
- [x] Commits por bloque lógico ya hechos durante la implementación.

---

**Resultado**: el panel `/admin` es navegable completo con o sin noche activa. Costo real:
cambios acotados a 3 archivos de producto (`OpenNightModal.tsx`, `AdminClient.tsx`, nuevo
`randomKeyword.ts`) + tests nuevos, sin tocar backend ni esquema, gracias a que la auditoría
previa (en `/plan`) confirmó que ninguna sección del panel dependía de `event` como prop.
