# Auditoría de Ciberseguridad — Cocktrail / BarQR

**Estado**: draft
**Fecha**: 2026-07-23
**Frameworks**: MITRE ATT&CK, NIST CSF 2.0, MITRE ATLAS, MITRE D3FEND, NIST AI RMF

> Auditoría integral de postura de seguridad del monorepo completo usando el skill
> `anthropic-cybersecurity-skills` (754 skills, 26 dominios). Mapeo detallado de
> controles en [`framework-mappings.md`](./framework-mappings.md).

---

## Problema / Por qué

Cocktrail es un sistema de pedidos y cobro para boliches que corre **on-premise en una mini-PC dentro de la LAN del local**. Maneja datos sensibles: ventas, totales de caja, hashes de contraseñas de staff, tokens de Mercado Pago (encriptados), y la clave de cierre de cada noche. Un compromiso del sistema permitiría:

- **Fraude financiero**: manipular totales de ventas, crear ventas falsas, borrar registros de caja.
- **Suplantación de operadores**: forjar sesiones de `admin` o `caja` para abrir/cerrar noches, modificar la carta de tragos, o generar tickets falsos.
- **Robo de credenciales MP**: si las claves de encriptación (`MP_TOKEN_SECRET`, `MP_HANDOFF_KEY`) se exponen, los tokens de acceso al Point/Posnet quedan comprometidos y un atacante podría procesar pagos o reembolsos no autorizados.
- **Exfiltración de datos del negocio**: historial de ventas, márgenes, configuración de precios — datos con valor competitivo.

El proyecto **no ha pasado por una auditoría de seguridad formal** hasta ahora. Las fases anteriores (1–6 del roadmap) se enfocaron en funcionalidad, arquitectura (SOLID/clean code) y empaquetado. Esta auditoría es el primer paso para cerrar la brecha de seguridad antes del deploy productivo en boliches reales.

---

## Objetivo

1. Identificar **todas las vulnerabilidades, debilidades de hardening y riesgos residuales** del sistema completo (API, frontend, infraestructura Docker, edge functions, Supabase local/cloud, integraciones MP).
2. Clasificar cada hallazgo por **severidad** (crítica / alta / media / baja) y por **framework** (ATT&CK, NIST CSF, D3FEND, ATLAS, AI RMF).
3. Proponer **remediación concreta** para cada hallazgo, con priorización basada en impacto × probabilidad × esfuerzo.
4. Dejar un **mapa vivo** (`framework-mappings.md`) que permita a futuros agentes/auditores navegar los controles de seguridad del sistema.

---

## Criterios de aceptación

- **Dado** el código auditado, **cuando** se revisa este spec, **entonces** cada hallazgo tiene: severidad, ubicación exacta (archivo:línea), vector de ataque, y remediación propuesta.
- **Dado** un hallazgo crítico o alto, **cuando** se implementa su remediación, **entonces** el hallazgo se marca `done` y se referencia el commit/PR que lo resolvió.
- **Dado** el mapa de frameworks, **cuando** se consulta `framework-mappings.md`, **entonces** se puede trazar cualquier componente del sistema a sus controles ATT&CK, NIST CSF, D3FEND, y viceversa.

---

## Fuera de alcance

- No se modifica código en esta fase — es una auditoría, no una remediación (salvo hallazgos triviales que el auditor aplique "de paso").
- No se hace pentesting activo (no se lanzan escaneos, fuzzing, ni exploits reales contra el sistema corriendo).
- No se auditan dependencias de terceros (npm audit, supply chain) — eso es una fase separada.
- No se evalúa cumplimiento normativo (PCI-DSS para MP, protección de datos personales en Argentina) — requiere asesoría legal externa.

---

## Hallazgos

### CRÍTICOS (3)

#### C1. Fallback de `AUTH_SECRET` a secreto público en `proxy.ts` (web)

**Archivo**: `apps/web/src/proxy.ts:42`
**ATT&CK**: T1557.001 (LLMNR/NBT-NS Poisoning), T1078 (Valid Accounts)
**NIST CSF**: PR.AC-1, PR.AC-7

```typescript
const secret =
  process.env.COCKTRAIL_AUTH_SECRET?.trim() ||
  process.env.AUTH_SECRET?.trim() ||
  "dev-secret-change-me-in-production-longer-than-32-chars";  // ← PÚBLICO
```

El edge middleware del frontend verifica cookies HMAC usando este secreto. Si `AUTH_SECRET` no está configurado en `apps/web/.env`, el middleware **silenciosamente** usa el secreto dev hardcodeado. Cualquier atacante que lea el código fuente (público en GitHub) puede forjar cookies de sesión con rol `admin` o `caja` y eludir completamente la autenticación del frontend.

**Vector de ataque**:
1. Atacante en la misma LAN (o con acceso al repo) conoce el secreto dev.
2. Forja cookie: `admin.hacker.<expiry>.<HMAC-SHA256(secreto)>`.
3. Navega a `/admin` — el proxy valida la cookie como legítima.
4. Acceso total al panel de administración.

**Nota**: El backend (API) **sí** rechazaría estas requests porque valida contra su propio `AUTH_SECRET` configurado (que es distinto si se configuró correctamente en `apps/api/.env`). Pero el proxy ya dejó pasar al atacante al frontend, y si el backend también tiene el secreto mal configurado, el ataque es completo. **Defensa en profundidad rota**: el proxy es la primera línea y está fallando.

**Remediación**: Rechazar startup si el secreto es el dev default. Lanzar error o redirect a `/error?reason=misconfigured` en vez de degradar silenciosamente.

```typescript
const SECRET = process.env.COCKTRAIL_AUTH_SECRET?.trim()
            || process.env.AUTH_SECRET?.trim();
if (!SECRET || SECRET === "dev-secret-change-me-in-production-longer-than-32-chars") {
  throw new Error("AUTH_SECRET no configurado en apps/web — el proxy no puede iniciar sin secreto real.");
}
```

---

#### C2. SHA-256 sin salt para contraseñas de staff en DB

**Archivo**: `apps/api/src/modules/auth/credentials.ts:15-17`
**ATT&CK**: T1110.002 (Brute Force: Password Cracking), T1003 (OS Credential Dumping)
**NIST CSF**: PR.AC-1, PR.DS-5

```typescript
function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}
```

SHA-256 **plano, sin salt, sin iteraciones**. Si un atacante obtiene acceso de lectura a la tabla `users` (vía backup expuesto, acceso a la mini-PC, o sync cloud mal configurado), los hashes son crackeables en **minutos** con tablas rainbow o GPU brute-force. Una GPU moderna prueba ~10^9 SHA-256/segundo — un diccionario de 10 millones de contraseñas comunes se prueba en milisegundos.

**Vector de ataque**:
1. Atacante obtiene `SELECT * FROM users` (vía backup, acceso físico a la mini-PC, o DB expuesta).
2. Corre `hashcat -m 1400` contra los hashes.
3. Recupera contraseñas en texto plano de TODO el staff.
4. Accede como admin/caja al sistema.

**Remediación**: Migrar a bcrypt (12 rounds) o argon2id. La migración es compatible hacia atrás: agregar columna `password_hash_v2`, al login verificar con bcrypt; si el usuario aún tiene el hash viejo, verificar con SHA-256 y **rehashear automáticamente** a bcrypt en ese momento. Mínimo 12 rounds de bcrypt (cost factor). No usar SHA-512 ni SHA-3 sin salt — el problema no es el algoritmo de hash, es la falta de salt e iteraciones.

```typescript
import { hash, verify } from "bcrypt"; // o @node-rs/bcrypt para evitar dependencia nativa
const BCRYPT_ROUNDS = 12;
```

---

#### C3. Contraseñas de fallback en texto plano desde variables de entorno

**Archivo**: `apps/api/src/modules/auth/credentials.ts:33-37`
**ATT&CK**: T1552.001 (Unsecured Credentials: Credentials In Files)
**NIST CSF**: PR.AC-1, PR.DS-5

```typescript
const USERS: Record<string, { password: string; role: Role }> = {
  [env.ADMIN_USER]: { password: env.ADMIN_PASS, role: "admin" },
  [env.CAJA_USER]: { password: env.CAJA_PASS, role: "caja" },
};
```

Las credenciales de fallback (`admin/admin`, `caja/caja` por default) se comparan **en texto plano** (`u.password === password`). Si un atacante lee el archivo `.env` (backup expuesto, acceso al filesystem de la mini-PC, o el `.env` versionado por error), obtiene las credenciales de admin **sin necesidad de crackear nada**.

Además, los defaults `admin/admin` y `caja/caja` son credenciales conocidas. Si el operador no cambia `.env`, el sistema arranca con admin:admin funcional.

**Vector de ataque**:
1. Atacante accede al filesystem de la mini-PC (vía USB, backup, o acceso remoto).
2. Lee `apps/api/.env` → `ADMIN_USER=admin`, `ADMIN_PASS=admin`.
3. Login directo como admin.

**Remediación**:
1. No almacenar credenciales de fallback en texto plano. Si se mantienen, hashearlas con bcrypt al iniciar el server (mismo estándar que DB users).
2. Forzar cambio de contraseña en el primer login si se detecta que las credenciales son los defaults de `.env.example`.
3. Evaluar eliminar el fallback por completo y exigir seeding de DB (ya existe `ensureLocalMasterDataSeeded`).

---

### ALTOS (5)

#### A1. Rate limit de login extremadamente laxo

**Archivo**: `apps/api/src/shared/middleware/rate-limit.ts:11`
**ATT&CK**: T1110 (Brute Force)
**NIST CSF**: PR.AC-7

```typescript
export const loginLimiter = limiter(15 * 60 * 1000, 1000, "Demasiados intentos de login.");
```

**1000 intentos cada 15 minutos** (~1.1 intentos/segundo) en **todos los entornos** (dev y prod). Con 2 usuarios de fallback (`admin`, `caja`) y contraseñas débiles, un atacante en la LAN puede probar cientos de combinaciones sin activar ningún bloqueo. Para un sistema con ~10 usuarios de staff como máximo, 5 intentos cada 15 minutos por IP sería razonable.

**Remediación**: Reducir a 5-10 intentos/15min en producción. Separar dev (100 intentos) de prod (5 intentos), como ya se hace con `generalLimiter` y `orderLimiter`.

---

#### A2. CORS permite cualquier IP de LAN en producción

**Archivo**: `apps/api/src/app.ts:222`
**ATT&CK**: T1090 (Proxy), T1190 (Exploit Public-Facing Application)
**NIST CSF**: PR.AC-3

```typescript
/(http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+)(:\d+)?$)/
```

En producción, **cualquier dispositivo en cualquier subred privada** (192.168.x.x, 10.x.x.x, 172.16-31.x.x) puede hacer requests CORS con credenciales. Esto incluye redes WiFi abiertas del boliche, dispositivos de clientes, etc. Si un cliente malicioso en la misma WiFi descubre la IP de la mini-PC, puede hacer requests autenticadas desde su navegador.

El CORS con `credentials: true` + regex amplio = cualquier página servida desde una IP de LAN puede hacer fetch con cookies incluidos. Un cliente que abre una página maliciosa en la misma WiFi podría hacer CSRF-like requests si la víctima (admin/cajera) visita esa página.

**Remediación**: Restringir CORS en producción a exactamente `FRONTEND_URL` (configurada en `.env`). La regex amplia es conveniente para desarrollo pero peligrosa en producción. Agregar validación explícita:

```typescript
const allowedOrigins = env.NODE_ENV === "development"
  ? [/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+)(:\d+)?$/]
  : [env.FRONTEND_URL];
```

---

#### A3. No hay invalidación de sesiones en el servidor

**Archivo**: `apps/api/src/modules/auth/session.ts`
**ATT&CK**: T1078.001 (Valid Accounts: Default Accounts), T1530 (Data from Cloud Storage)
**NIST CSF**: PR.AC-1

Las sesiones HMAC son **stateless**: no hay registro server-side de sesiones activas. El logout solo borra la cookie del cliente, pero el token sigue siendo válido hasta que expire (12 horas). Si un atacante roba una cookie (vía XSS, acceso físico, o MITM en WiFi abierta), puede usarla incluso después de que el usuario legítimo "cerró sesión".

No hay mecanismo para:
- Invalidar todas las sesiones de un usuario (ej. al cambiar contraseña).
- Invalidar una sesión específica.
- Detectar uso concurrente de la misma sesión desde múltiples IPs.

**Remediación**: Para un sistema LAN de bajo riesgo, una lista negra en memoria (Set de tokens revocados, limpiada cada 12h cuando expiran naturalmente) sería suficiente sin agregar dependencia de Redis/DB. Si se requiere invalidación inmediata, agregar columna `token_version` en `users` e incluirla en la cookie — al cambiar la versión (cambio de contraseña), todas las sesiones anteriores quedan inválidas.

---

#### A4. Postgres expuesto en el host (puerto 54322) con contraseña default

**Archivo**: `docker-compose.yml` (puerto `54322:5432`)
**ATT&CK**: T1190 (Exploit Public-Facing Application), T1078 (Valid Accounts)
**NIST CSF**: PR.AC-3, PR.PT-3

```yaml
ports:
  - "54322:5432"
```

Postgres escucha en `0.0.0.0:54322` de la máquina host. Cualquier dispositivo en la LAN puede conectarse directamente a la base de datos con las credenciales default (`postgres:postgres`), bypasseando completamente Kong, PostgREST, la API, y toda la capa de autenticación/autorización.

**Vector de ataque**:
1. Atacante en la LAN escanea puertos → encuentra 54322 abierto.
2. Conecta con `psql -h <mini-pc-ip> -p 54322 -U postgres` + password `postgres`.
3. `SELECT * FROM orders; DELETE FROM night_events;` — acceso total de superusuario.

**Remediación**: 
1. **No exponer el puerto de Postgres al host**. Kong (54321) ya expone la API REST. El backend se conecta a Postgres dentro de la red Docker (nombre de servicio `db`), no necesita el puerto host. Eliminar la línea `ports: - "54322:5432"` del compose.
2. Si se necesita acceso dev directo, usar un perfil de Docker Compose (`profiles: [debug]`) como ya se hace con `studio` y `meta`.
3. Cambiar `POSTGRES_PASSWORD` a un valor generado aleatoriamente (ya existe `generate-keys.mjs`).

---

#### A5. Sin límite de tamaño de request body

**Archivo**: `apps/api/src/app.ts:233` (implícito en `express.json()`)
**ATT&CK**: T1499.004 (Endpoint Denial of Service: Application Exhaustion)
**NIST CSF**: PR.PT-3, DE.CM-4

```typescript
app.use(express.json());
```

`express.json()` usa el default de 100 KB de body-parser. Si bien es un límite, no hay un límite explícito y documentado. Un atacante en la LAN podría enviar requests con bodies cercanos a 100 KB repetidamente para consumir memoria del proceso Node.

**Remediación**: Agregar límite explícito con mensaje de error claro:

```typescript
app.use(express.json({ limit: "16kb" }));
```

Las requests legítimas (orders con arrays de items, config updates) nunca superan unos pocos KB.

---

### MEDIOS (6)

#### M1. Sin validación de `X-Bar-Id` y `X-Device-Id` contra sesión autenticada

**Archivo**: `apps/api/src/app.ts:230`
**ATT&CK**: T1078 (Valid Accounts)
**NIST CSF**: PR.AC-3

Los headers `X-Bar-Id` y `X-Device-Id` se aceptan vía CORS pero **no se validan** contra la sesión del usuario. Cualquier sesión autenticada puede enviar cualquier `X-Bar-Id`, potencialmente operando en nombre de otra barra. Actualmente el sistema es single-bar por diseño, así que el impacto es bajo, pero si se escala a multi-barra, esto se vuelve un vector de escalación horizontal.

**Remediación**: Validar que `X-Bar-Id` corresponda a una barra asignada al usuario de la sesión, o directamente derivar el `barId` de la sesión en vez de confiar en el header del cliente.

---

#### M2. `connectSrc` CSP extremadamente amplio

**Archivo**: `apps/api/src/app.ts:211`
**ATT&CK**: T1190 (Exploit Public-Facing Application)
**NIST CSF**: PR.AC-3

```typescript
connectSrc: ["'self'", env.FRONTEND_URL, "ws:", "wss:", "http://localhost:*", 
              "http://127.0.0.1:*", "http://192.168.*", "http://10.*", "http://172.*"]
```

`connectSrc` permite conexiones SSE/fetch a **cualquier puerto** en localhost y **cualquier IP** en subredes privadas. Esto es más amplio de lo necesario — con `'self'` y `FRONTEND_URL` alcanza. Los wildcards son para desarrollo; en producción deberían acotarse.

**Remediación**: Estrechar `connectSrc` a `'self'` + `env.FRONTEND_URL` en producción. Los wildcards de LAN solo en desarrollo.

---

#### M3. Kong sirve el API REST sin TLS

**Archivo**: `docker-compose.yml`, `kong.yml.template`
**ATT&CK**: T1040 (Network Sniffing)
**NIST CSF**: PR.DS-2

Toda la comunicación entre el backend y PostgREST (vía Kong en 54321) es HTTP plano. En la misma LAN, un atacante con acceso a la red puede sniffear tráfico y ver:
- `apikey` (service_role key) en cada request.
- Datos de órdenes, ventas, y configuración en tránsito.

Esto es aceptable para una LAN cableada y controlada, pero si la WiFi del boliche está en la misma VLAN que la mini-PC, el tráfico es sniffable por cualquier cliente conectado.

**Remediación**: Para producción, configurar TLS entre backend y Kong con certificados auto-firmados (generados por `generate-keys.mjs`). El overhead es mínimo para el volumen de requests del sistema.

---

#### M4. Logging no estructurado — `console.log/error` sin niveles ni rotación

**Archivo**: Todo `apps/api/src/`
**ATT&CK**: T1562.001 (Impair Defenses: Disable or Modify Tools)
**NIST CSF**: DE.CM-1, DE.CM-3

El sistema usa `console.log`, `console.error`, y `console.warn` directamente. No hay:
- Niveles de severidad (debug, info, warn, error).
- Rotación de logs (el proceso Node escribe a stdout, que Docker captura — sin límite de tamaño).
- Contexto estructurado (request ID, usuario, IP).
- Separación de logs de acceso vs. logs de aplicación.

Esto dificulta la detección de incidentes y la auditoría forense. Si ocurre un ataque, no hay trazabilidad de qué requests lo causaron.

**Remediación**: Adoptar `pino` (mínimo overhead, JSON nativo) con `pino-pretty` en desarrollo. Agregar request ID vía middleware. Configurar rotación con `docker-compose` logging driver (`max-size`, `max-file`) como mínimo.

---

#### M5. El edge middleware duplica lógica HMAC sin compartir código con backend

**Archivo**: `apps/web/src/proxy.ts` y `apps/api/src/modules/auth/session.ts`
**ATT&CK**: T1078 (Valid Accounts)
**NIST CSF**: PR.AC-1

Ambos implementan verificación de cookies HMAC-SHA256 de forma independiente:
- Backend: `createHmac("sha256", secret).update(payload).digest("hex")`
- Frontend (Edge): `crypto.subtle.importKey(...)` + `crypto.subtle.sign("HMAC", ...)`

Si el formato de cookie o el algoritmo cambia, hay que actualizar **dos implementaciones en dos runtimes distintos** (Node vs. Edge/Web Crypto). Ya se vio el riesgo en C1: el proxy tiene su propio fallback de secreto, distinto del backend.

**Remediación**: Extraer la lógica de verificación a `@cocktrail/shared` como una función pura que tome `secret: string` y `cookie: string` y devuelva `Session | null`. El backend usa `node:crypto`, el frontend usa Web Crypto — pero la interfaz y los tests son compartidos.

---

#### M6. SHA-256 en comparación de firma del proxy no es timing-safe

**Archivo**: `apps/web/src/proxy.ts:78`
**ATT&CK**: T1557 (Man-in-the-Middle)
**NIST CSF**: PR.AC-1

```typescript
if (sig !== expected) return null;  // comparación no constante en tiempo
```

En JavaScript de Edge runtime, `!==` entre strings **no es timing-safe**. Un atacante que puede medir tiempos de respuesta del proxy (en la misma LAN, con precisión de microsegundos) podría hacer un timing attack para derivar firmas HMAC válidas byte por byte. En la práctica, la latencia de red en WiFi (>1ms) hace este ataque extremadamente difícil pero no imposible en una LAN cableada.

**Remediación**: Si Web Crypto está disponible en el runtime, usar `crypto.subtle.timingSafeEqual` (no estándar, pero algunos edge runtimes lo exponen). Alternativa: comparar manualmente byte a byte sin early exit. Prioridad baja porque el vector es altamente teórico en WiFi.

---

### BAJOS (4)

#### B1. Sin CI/CD — no hay escaneo automático de seguridad

**Archivo**: No existe `.github/workflows/`
**NIST CSF**: DE.CM-4

No hay pipeline que ejecute tests, linting, o typechecking en cada push/PR. Esto significa que:
- Las vulnerabilidades pueden introducirse sin detección automática.
- No hay `npm audit` automatizado.
- Los tests de seguridad (ej. tests de auth, rate-limit) no se ejecutan en CI.

**Remediación**: Agregar GitHub Actions mínimo: `pnpm typecheck` + `pnpm test` + `pnpm lint` en cada PR a `main`.

---

#### B2. Kong CORS plugin sin configuración explícita

**Archivo**: `supabase/docker/kong.yml.template`
**NIST CSF**: PR.AC-3

El plugin `cors` en Kong está declarado sin configuración (`config: {}`), usando defaults que pueden ser demasiado permisivos. Dado que el API backend ya maneja CORS y Kong solo recibe requests del backend (nunca de clientes externos), el riesgo es bajo. Pero es una superficie innecesaria.

**Remediación**: Deshabilitar el plugin CORS de Kong (no es necesario — solo el backend habla con Kong) o configurarlo con orígenes restrictivos.

---

#### B3. `password` mínimo de 4 caracteres en `CreateUserSchema`

**Archivo**: `apps/api/src/shared/middleware/validate.ts` (CreateUserSchema)
**ATT&CK**: T1110 (Brute Force)
**NIST CSF**: PR.AC-1

```typescript
password: z.string().min(4).max(128)
```

Para usuarios staff con acceso a datos financieros, 4 caracteres es insuficiente. Mínimo recomendado: 8 caracteres.

**Remediación**: Subir a `min(8)` y recomendar (no forzar) complejidad en la UI de admin.

---

#### B4. Keys de Kong generadas pero no validadas al inicio

**Archivo**: `supabase/generate-keys.mjs`
**NIST CSF**: PR.AC-1

El script genera `ANON_KEY`, `SERVICE_ROLE_KEY`, y `JWT_SECRET` correctamente, pero no hay un health check al iniciar el backend que verifique que las keys configuradas **efectivamente funcionan** contra Kong. Si hay un mismatch (keys rotadas, compose recreado sin regenerar), el backend arranca pero falla en la primera query.

**Remediación**: Agregar un health check en `server.ts` que haga una query simple (`SELECT 1`) contra Kong/PostgREST antes de aceptar tráfico.

---

## Resumen de severidad

| Severidad | Cantidad | Hallazgos |
|---|---|---|
| **CRÍTICA** | 3 | C1 (secreto público en proxy), C2 (SHA-256 sin salt), C3 (credenciales en texto plano) |
| **ALTA** | 5 | A1 (rate limit laxo), A2 (CORS amplio), A3 (sesiones no invalidables), A4 (Postgres expuesto), A5 (sin límite de body) |
| **MEDIA** | 6 | M1 (headers sin validar), M2 (CSP amplio), M3 (sin TLS), M4 (logs no estructurados), M5 (HMAC duplicado), M6 (comparación no timing-safe) |
| **BAJA** | 4 | B1 (sin CI/CD), B2 (Kong CORS), B3 (password min 4), B4 (health check de keys) |
| **TOTAL** | **18** | |

---

## Priorización de remediación

Orden sugerido (impacto × probabilidad ÷ esfuerzo):

1. **C1** — secreto público en proxy (1 línea, sin dependencias)
2. **A4** — exponer Postgres (1 línea en compose, sin dependencias)
3. **A1** — rate limit de login (1 línea, sin dependencias)
4. **C2 + C3** — hashing de contraseñas (agregar bcrypt, migración de DB)
5. **A2** — CORS restrictivo en prod (5 líneas, condicional por NODE_ENV)
6. **A3** — invalidación de sesiones (token_version en DB, ~30 líneas)
7. **A5** — límite de body size (1 línea)
8. **M1–M6** — hardening progresivo
9. **B1–B4** — mejoras de proceso y monitoreo

---

## Controles existentes (lo que YA está bien)

El sistema ya implementa varias defensas significativas que esta auditoría **no** marca como hallazgos porque son correctas:

| Control | Ubicación | Evaluación |
|---|---|---|
| AES-256-GCM para tokens MP | `shared/crypto/aes-gcm.ts` | Correcto. HKDF, salt/IV aleatorios, auth tag, cross-platform (Node + WebCrypto). |
| `timingSafeEqual` en backend | `modules/auth/session.ts` | Correcto. Previene timing attacks en verificación de firma. |
| Zod input validation con strip | `shared/middleware/validate.ts` | Correcto. `req.body = result.data` descarta campos extra. |
| `verifyPayment` 3-value verdict | `modules/mercadopago/` | Correcto. No booleano: confirmado/rechazado/indeterminado. |
| `isPaymentSchemaReady` guard | `app.ts:152-157` | Correcto. Fail-safe si migraciones no aplicadas. |
| RLS deny-all + REVOKE para anon/authenticated | `migrations/*revoke*` | Correcto. Defensa en profundidad (REVOKE + RLS). |
| Idempotency key en órdenes | `modules/orders/` | Correcto. Previene double-spend. |
| Webhook idempotency (`x-request-id`) | `modules/mercadopago/` | Correcto. Dedup + freshness window (300s). |
| Single-seller invariant (unique partial index) | `migrations/*sellers*` | Correcto. Previene múltiples vendedores activos. |
| `AUTH_SECRET` producción rechaza defaults | `config/env.ts:79-87` | Correcto. Fail-fast si secreto débil en prod. |
| Helmet con CSP declarado | `app.ts:204-215` | Correcto (aunque `styleSrc: unsafe-inline` es laxo). |
| Rate limiting por endpoint | `shared/middleware/rate-limit.ts` | Correcto (aunque login es demasiado laxo). |
| 500 genérico sin leak de stack | `shared/middleware/error-handler.ts` | Correcto. `"Error interno"` + `console.error` server-side. |
| OAuth state nonce atómico (RPC) | `oauth_states.sql` + edge function | Correcto. `DELETE...RETURNING` + SECURITY DEFINER. |

---

## Próximos pasos

1. Implementar remediación de hallazgos críticos (C1, C2, C3) y altos (A1–A5).
2. Agregar tests de seguridad automatizados para los controles existentes (auth, rate-limit, input validation, payment verification).
3. Configurar CI/CD con escaneo de seguridad (npm audit, CodeQL, dependabot).
4. Evaluar pentesting externo antes del deploy productivo en boliches.
5. Revisar este spec después de cada fase del roadmap para mantenerlo actualizado.
