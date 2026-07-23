# Framework Mappings — Cocktrail / BarQR

**Fecha**: 2026-07-23
**Estado**: draft

> Mapeo de cada componente del sistema contra los 5 frameworks del skill
> `anthropic-cybersecurity-skills`: **MITRE ATT&CK v16**, **NIST CSF 2.0**,
> **MITRE ATLAS**, **MITRE D3FEND**, **NIST AI RMF 1.0**.

---

## 1. MITRE ATT&CK — Técnicas relevantes por componente

Cada técnica se mapea al componente del sistema donde aplica, con el hallazgo del
spec de auditoría que la cubre (`C1`, `A2`, etc.).

### Reconnaissance (TA0043)

| Técnica | ID | Componente | Hallazgo |
|---|---|---|---|
| Active Scanning: Vulnerability Scanning | T1595.001 | Kong :54321, Postgres :54322 | A4 — puertos expuestos facilitan escaneo |
| Gather Victim Network Information | T1590 | WiFi del boliche | A2 — CORS amplio permite descubrir servicios |

### Credential Access (TA0006)

| Técnica | ID | Componente | Hallazgo |
|---|---|---|---|
| Brute Force: Password Cracking | T1110.002 | `credentials.ts` — SHA-256 sin salt | C2 |
| Brute Force: Password Guessing | T1110.001 | `POST /api/auth/login` — rate limit laxo | A1 |
| Brute Force: Credential Stuffing | T1110.004 | `CreateUserSchema` — min 4 chars | B3 |
| Unsecured Credentials: Credentials In Files | T1552.001 | `.env` — fallback en texto plano | C3 |
| Steal Application Access Token | T1528 | `session.ts` — sesiones no invalidables | A3 |
| OS Credential Dumping | T1003 | Postgres :54322 expuesto | A4 |
| Network Sniffing | T1040 | Kong HTTP sin TLS | M3 |

### Initial Access (TA0001)

| Técnica | ID | Componente | Hallazgo |
|---|---|---|---|
| Valid Accounts: Default Accounts | T1078.001 | Fallback `admin/admin`, `caja/caja` | C3 |
| Valid Accounts: Domain Accounts | T1078.002 | Sesiones HMAC sin invalidación | A3 |
| Exploit Public-Facing Application | T1190 | Postgres expuesto, Kong sin TLS | A4, M3 |

### Persistence (TA0003)

| Técnica | ID | Componente | Hallazgo |
|---|---|---|---|
| Valid Accounts | T1078 | Sesiones 12h, proxy secreto público | C1, A3 |
| Create Account | T1136 | `POST /api/users` — solo admin puede | (OK) |

### Defense Evasion (TA0005)

| Técnica | ID | Componente | Hallazgo |
|---|---|---|---|
| Impair Defenses: Disable or Modify Tools | T1562.001 | Logging no estructurado | M4 |
| Indicator Removal: Clear Logs | T1070.001 | Audit logs sin protección adicional | (OK — POST-only, sin DELETE) |
| Modify Authentication Process | T1556 | Proxy con secreto público | C1 |

### Lateral Movement (TA0008)

| Técnica | ID | Componente | Hallazgo |
|---|---|---|---|
| Remote Services: Remote Desktop Protocol | T1021.001 | Mini-PC Windows — acceso físico/RDP al host | A4 |
| Use Alternate Authentication Material | T1550 | Sesiones HMAC sin invalidación server-side | A3 |

### Collection (TA0009)

| Técnica | ID | Componente | Hallazgo |
|---|---|---|---|
| Data from Information Repositories | T1213 | Postgres expuesto — `SELECT * FROM orders` | A4 |
| Man-in-the-Middle | T1557 | HTTP plano backend↔Kong | M3 |

### Impact (TA0040)

| Técnica | ID | Componente | Hallazgo |
|---|---|---|---|
| Endpoint Denial of Service: Application Exhaustion | T1499.004 | Sin límite de body size | A5 |
| Data Destruction | T1485 | Acceso directo a Postgres como superuser | A4 |

---

## 2. MITRE D3FEND — Contramedidas implementadas y faltantes

### Contramedidas IMPLEMENTADAS

| Contramedida D3FEND | ID | Dónde | Cómo |
|---|---|---|---|
| **Multi-factor Authentication** | D3-MFA | `auth/session.ts` | HMAC cookie + `timingSafeEqual` — 2do factor implícito (cookie HttpOnly no accesible vía JS) |
| **Encryption at Rest** | D3-EAR | `crypto/aes-gcm.ts` | AES-256-GCM para tokens MP en DB |
| **Credential Hardening** | D3-CH | `config/env.ts` | AUTH_SECRET min 32 chars, rechaza "change-me"/"secret" en prod |
| **Input Validation** | D3-IV | `middleware/validate.ts` | Zod schemas con `.strip()`, body sanitizado |
| **Application Rate Limiting** | D3-ARL | `middleware/rate-limit.ts` | Per-endpoint rate limits (general, login, orders, tickets) |
| **Homoglyph Detection** | D3-HD | `middleware/validate.ts` | Regex `/^[A-Za-z0-9-]{16,64}$/` en idempotencyKey |
| **Transaction Authentication** | D3-TA | `orders/orders.service.ts` | `verifyPayment` 3-value verdict (confirmado/rechazado/indeterminado) |
| **Idempotency** | D3-IDM | `orders/orders.service.ts` | Idempotency key con UNIQUE index en DB |
| **Database Hardening** | D3-DBH | `migrations/` | RLS deny-all + REVOKE ALL de anon/authenticated |
| **Process Segment Authentication** | D3-PSA | `auth/middleware.ts` | `authMiddleware` + `requireRole(...)` por ruta |
| **Certificate-based Authentication** | D3-CA | `supabase/generate-keys.mjs` | JWT signing via `service_role` key |
| **Policy Enforcement** | D3-PE | `docker/kong.yml` | Kong key-auth + ACL plugin en gateway |
| **Secure Cookies** | D3-SC | `auth/session.ts` | HttpOnly, SameSite=Lax, Secure en prod |
| **Security Headers** | D3-SH | `app.ts` | Helmet con CSP, HSTS, X-Content-Type-Options, etc. |

### Contramedidas FALTANTES

| Contramedida D3FEND | ID | Prioridad | Hallazgo |
|---|---|---|---|
| **Strong Password Policy** | D3-SPP | ALTA | C2 + C3 + B3 — SHA-256 sin salt, bcrypt requerido, min 8 chars |
| **Credential Rotation** | D3-CR | MEDIA | A3 — sesiones no invalidables al rotar credenciales |
| **Session Lock** | D3-SL | MEDIA | A3 — sin mecanismo de invalidation masiva de sesiones |
| **Network Traffic Filtering** | D3-NTF | ALTA | A4 — Postgres expuesto en host, debería ser solo red Docker interna |
| **Transport Layer Security** | D3-TLS | MEDIA | M3 — Kong↔PostgREST HTTP plano |
| **System Log Auditing** | D3-SLA | MEDIA | M4 — logging no estructurado, sin request IDs |
| **Application Hardening** | D3-AH | MEDIA | A5 — sin límite explícito de body size |
| **URL Filtering** | D3-URLF | MEDIA | A2 — CORS demasiado amplio en producción |
| **Software Update** | D3-SU | BAJA | B1 — sin CI/CD, sin dependabot |

---

## 3. NIST CSF 2.0 — Categorías por función

### GOVERN (GV) — Contexto organizacional

| Subcategoría | Estado | Evidencia |
|---|---|---|
| GV.OC-1: Mission, objectives, stakeholders | ✅ | `README.md`, `docs/ARCHITECTURE.md` |
| GV.OC-2: Mission/business functions | ✅ | 4 roles definidos (admin, caja, barra, cliente) |
| GV.RM-1: Risk management objectives | ⚠️ | ROADMAP.md menciona riesgos (R7, R26, R28) pero no hay proceso formal de gestión de riesgos |
| GV.SC-1: Supply chain risk strategy | ⚠️ | Sin proceso de evaluación de dependencias |

### IDENTIFY (ID) — Comprensión del riesgo

| Subcategoría | Estado | Evidencia |
|---|---|---|
| ID.AM-1: Physical devices inventory | ✅ | Implícito — sistema single-machine, la mini-PC es el único activo |
| ID.AM-2: Software platforms inventory | ✅ | `package.json`, `pnpm-workspace.yaml`, `docker-compose.yml` |
| ID.RA-1: Vulnerability identification | ⚠️ | Esta auditoría es el primer paso, no hay proceso continuo |
| ID.RA-5: Threat modeling | ❌ | No se ha hecho threat modeling formal |

### PROTECT (PR) — Salvaguardas

| Subcategoría | Estado | Evidencia |
|---|---|---|
| PR.AC-1: Identities managed | ⚠️ | HMAC cookie auth (OK), pero SHA-256 sin salt (C2), credenciales texto plano (C3) |
| PR.AC-3: Remote access managed | ⚠️ | LAN-only por diseño, pero CORS amplio (A2) y Postgres expuesto (A4) |
| PR.AC-5: Network integrity protected | ⚠️ | Kong gateway (OK), pero sin TLS (M3) |
| PR.AC-7: Users authenticated | ⚠️ | HMAC + `timingSafeEqual` (OK), pero rate limit laxo (A1) |
| PR.DS-2: Data-in-transit protected | ⚠️ | Helmet + CSP (OK), pero backend↔Kong HTTP (M3) |
| PR.DS-5: Data-in-rest protected | ⚠️ | AES-256-GCM para tokens (OK), pero hashes débiles en DB (C2) |
| PR.PT-1: Audit/log records | ⚠️ | `audit_logs` table (OK), pero logging no estructurado (M4) |
| PR.PT-3: Access to assets protected | ⚠️ | RLS + REVOKE para DB (OK), pero Postgres expuesto en host (A4) |
| PR.PT-4: Backup integrity | ✅ | Cloud sync opcional, restore documentado en `deuda-pre-fase-6/restaurar-backup-desde-cloud.md` |
| PR.AT-1: Awareness and training | ❌ | No hay programa de concientización para el staff del boliche |
| PR.PS-1: Configuration management | ✅ | `.env.example` mantiene defaults documentados |

### DETECT (DE) — Monitoreo

| Subcategoría | Estado | Evidencia |
|---|---|---|
| DE.CM-1: Network monitored | ❌ | Sin monitoreo de red |
| DE.CM-3: Personnel activity monitored | ⚠️ | `audit_logs` registra acciones, pero sin alertas |
| DE.CM-4: Malicious code detected | ❌ | Sin escaneo de malware, sin npm audit automatizado |
| DE.CM-6: Service provider monitoring | ❌ | Sin monitoreo de disponibilidad de Supabase Cloud / MP APIs |
| DE.AE-2: Event data analyzed | ❌ | Sin correlación de eventos ni SIEM |

### RESPOND (RS) — Respuesta a incidentes

| Subcategoría | Estado | Evidencia |
|---|---|---|
| RS.MA-1: Incident response plan executed | ❌ | No existe plan de respuesta a incidentes |
| RS.AN-1: Incidents investigated | ❌ | Sin proceso de investigación |
| RS.CO-2: Internal stakeholders notified | ❌ | Sin procedimiento de notificación |
| RS.CO-3: Recovery activities communicated | ❌ | Sin procedimiento de comunicación |

### RECOVER (RC) — Recuperación

| Subcategoría | Estado | Evidencia |
|---|---|---|
| RC.RP-1: Recovery plan executed | ✅ | `deuda-pre-fase-6/restaurar-backup-desde-cloud.md` — restore documentado y probado |
| RC.RP-2: Recovery plan updated | ❌ | No hay proceso de actualización/mejora continua |
| RC.CO-2: Reputation repaired | ❌ | Fuera de alcance (no es sistema público) |

---

## 4. MITRE ATLAS — Adversarial Threat Landscape for AI Systems

> Cocktrail **no utiliza modelos de IA/ML** en su operación actual. No hay LLMs,
> modelos de recomendación, ni pipelines de ML. El sistema es determinístico.
>
> Sin embargo, se evalúa riesgo futuro:

| Técnica ATLAS | ID | Riesgo futuro | Mitigación |
|---|---|---|---|
| **Acquire Public ML Artifacts** | AML.T0000 | Si se agrega modelo de recomendación de tragos o predicción de demanda | Entrenar solo con datos anonimizados del local, no shared model |
| **Poison Training Data** | AML.T0020 | Si el modelo aprende de datos de ventas en vivo | Validar integridad de datos de entrenamiento (checksum, source verification) |
| **Evade ML Model** | AML.T0043 | Si el modelo clasifica preferencias de clientes | Rate limiting + detección de anomalías en inputs |
| **Exfiltrate ML Artifacts** | AML.T0049 | Si el modelo contiene patrones de ventas competitivos | Encrypt model at rest (misma AES-256-GCM) |
| **Discover ML Model Ontology** | AML.T0054 | Consultas repetidas al modelo para inferir arquitectura | API rate limiting + output clamping |

### Evaluación NIST AI RMF 1.0

Cocktrail **no opera sistemas de IA** → **no aplica** NIST AI RMF en su estado actual.

Si en el futuro se agrega IA (ej. recomendaciones de tragos basadas en historial), se deberá:
1. **Map** (GOVERN 1.0): identificar contexto de uso, beneficiarios, riesgos.
2. **Measure** (MEASURE 2.0): evaluar fairness (sesgo en recomendaciones), robustness (inputs adversariales).
3. **Manage** (MANAGE 3.0): documentar decisiones de diseño, plan de respuesta a incidentes de IA.
4. **Govern** (GOVERN 4.0): accountability, transparencia sobre el uso de IA.

---

## 5. Mapeo cruzado: Componente → ATT&CK → D3FEND → NIST CSF

| Componente | ATT&CK | D3FEND (existe / falta) | NIST CSF |
|---|---|---|---|
| `apps/web/src/proxy.ts` | T1556, T1078 | D3-PSA ✅ / D3-CR ❌ | PR.AC-1 ⚠️ (C1) |
| `modules/auth/credentials.ts` | T1110.002, T1552.001 | D3-SPP ❌ | PR.AC-1 ⚠️ (C2, C3) |
| `modules/auth/session.ts` | T1528, T1078.002 | D3-SC ✅ / D3-SL ❌ | PR.AC-1 ⚠️ (A3) |
| `shared/crypto/aes-gcm.ts` | N/A (contramedida) | D3-EAR ✅ | PR.DS-5 ✅ |
| `shared/middleware/rate-limit.ts` | T1110 (mitigación) | D3-ARL ✅ | PR.AC-7 ⚠️ (A1) |
| `shared/middleware/validate.ts` | T1190 (mitigación) | D3-IV ✅ | PR.AC-1 ✅ |
| `app.ts` (CORS/CSP/Helmet) | T1090, T1190 (mitigación) | D3-SH ✅ / D3-URLF ❌ | PR.AC-3 ⚠️ (A2, M2) |
| `app.ts` (express.json) | T1499.004 | D3-AH ❌ | PR.PT-3 ⚠️ (A5) |
| `docker-compose.yml` (Postgres) | T1190, T1078, T1003 | D3-NTF ❌ | PR.AC-3 ⚠️ (A4) |
| `docker-compose.yml` (Kong) | T1040 | D3-TLS ❌ | PR.DS-2 ⚠️ (M3) |
| `migrations/` (RLS/REVOKE) | T1213 (mitigación) | D3-DBH ✅ | PR.PT-3 ✅ |
| `modules/orders/` (payment verify) | N/A (contramedida) | D3-TA ✅, D3-IDM ✅ | PR.DS-5 ✅ |
| `modules/audit-logs/` | T1562.001 | D3-SLA ⚠️ | DE.CM-1 ⚠️ (M4) |
| `modules/mercadopago/` (webhooks) | N/A (contramedida) | D3-IDM ✅ | PR.DS-5 ✅ |
| `supabase/functions/mp-auth-callback/` | T1528 (mitigación) | D3-EAR ✅, D3-CA ✅ | PR.DS-5 ✅ |
| CI/CD (no existe) | T1562.001 | D3-SU ❌ | DE.CM-4 ❌ (B1) |

---

## 6. Resumen de cobertura por framework

### MITRE ATT&CK — Técnicas cubiertas (mitigadas) y descubiertas

| Categoría | Cubiertas | Descubiertas (vulnerables) |
|---|---|---|
| Reconnaissance | 0 | 2 |
| Credential Access | 0 (mitigación parcial vía rate limit) | 7 |
| Initial Access | 1 (HMAC auth) | 3 |
| Persistence | 1 | 1 |
| Defense Evasion | 0 | 3 |
| Lateral Movement | 0 | 2 |
| Collection | 0 (mitigación vía RLS) | 2 |
| Impact | 0 | 2 |

### NIST CSF 2.0 — Madurez por función

| Función | Categorías cubiertas | Nivel de madurez |
|---|---|---|
| **GOVERN** | 2/4 | Parcial (documentación OK, gestión de riesgos débil) |
| **IDENTIFY** | 2/4 | Parcial (inventario OK, threat modeling ausente) |
| **PROTECT** | 10/11 | **Buena** — mayoría de controles técnicos implementados, con gaps puntuales |
| **DETECT** | 1/6 | **Deficiente** — sin monitoreo, sin SIEM, sin alertas |
| **RESPOND** | 0/4 | **Ausente** — no hay plan de respuesta a incidentes |
| **RECOVER** | 1/3 | Parcial (restore OK, mejora continua ausente) |

### MITRE D3FEND — Cobertura de contramedidas

| Estado | Cantidad |
|---|---|
| **Implementadas** | 14 |
| **Faltantes (prioridad alta)** | 3 |
| **Faltantes (prioridad media)** | 5 |
| **Faltantes (prioridad baja)** | 1 |

### MITRE ATLAS — Riesgo AI

| Estado |
|---|
| **No aplica** — el sistema no usa IA. Riesgo futuro documentado para 5 técnicas si se agrega ML. |

### NIST AI RMF

| Estado |
|---|
| **No aplica** — el sistema no opera sistemas de IA. |

---

## 7. Plan de mejora de postura

Basado en los gaps de framework detectados, orden sugerido de iniciativas:

### Fase 1 — Cerrar gaps críticos (PROTECT)

1. C1 + C2 + C3: endurecer autenticación (bcrypt, eliminar secretos públicos, eliminar texto plano)
2. A4: cerrar exposición de Postgres
3. A1 + A2: endurecer rate limiting y CORS
4. A5: límite de body size

### Fase 2 — Hardening (PROTECT + DETECT)

1. A3: invalidación de sesiones
2. M3: TLS para backend↔Kong
3. M4: logging estructurado
4. M1 + M2 + M5: limpieza de deuda (headers, CSP, HMAC duplicado)
5. B1: CI/CD con escaneo

### Fase 3 — Monitoreo y respuesta (DETECT + RESPOND)

1. DE.CM-1: health checks automatizados + alertas
2. DE.CM-3: dashboard de auditoría en `/admin`
3. RS.MA-1: plan de respuesta a incidentes documentado
4. RC.RP-2: proceso de mejora continua post-incidente

### Fase 4 — Gobernanza (GOVERN + IDENTIFY)

1. GV.RM-1: proceso formal de gestión de riesgos
2. ID.RA-5: threat modeling formal del sistema
3. GV.SC-1: evaluación de supply chain (npm audit automatizado)
4. PR.AT-1: concientización del staff del boliche sobre seguridad básica (no compartir contraseñas, no dejar la mini-PC desatendida)
