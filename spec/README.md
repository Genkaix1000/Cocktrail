# Spec — Auditoría de Ciberseguridad Cocktrail / BarQR

Auditoría integral de postura de seguridad del proyecto usando los 5 frameworks de referencia del
skill `anthropic-cybersecurity-skills`: **MITRE ATT&CK**, **NIST CSF 2.0**, **MITRE ATLAS**,
**MITRE D3FEND**, y **NIST AI RMF**.

El skill original incluye 754 skills en 26 dominios de seguridad. Esta carpeta aplica el
framework de análisis del skill a Cocktrail, generando los mapas y hallazgos correspondientes.

## Archivos

| Archivo | Contenido |
|---|---|
| [`auditoria-ciberseguridad.md`](./auditoria-ciberseguridad.md) | Hallazgos de seguridad, severidad, remediación priorizada |
| [`framework-mappings.md`](./framework-mappings.md) | Mapeo detallado de cada componente del sistema contra los 5 frameworks |

## Severidades

| Severidad | Significado |
|---|---|
| **CRÍTICA** | Compromiso total del sistema con impacto inmediato, sin atenuantes prácticos |
| **ALTA** | Vulnerabilidad explotable con impacto significativo, requiere atenuantes específicos |
| **MEDIA** | Debilidad de seguridad que aumenta la superficie de ataque o reduce defensa en profundidad |
| **BAJA** | Mejora de hardening, buenas prácticas, o deuda técnica con impacto de seguridad marginal |

## Límites de confianza

```
[Cliente WiFi] ──► [apps/web (Next.js)] ──► [apps/api (Express)] ──► [Kong :54321] ──► [PostgREST] ──► [Postgres :54322]
                          │                          │
                    [proxy.ts edge]           [auth middleware]
                     (HMAC cookie)            (HMAC + rate-limit + CORS + helmet)

[Internet] ──► [Supabase Cloud Edge Function] ──► [mercadopago_seller_handoff] (AES-256-GCM)
                                              ──► [mp-auth-callback] → [Backend poll]
```

## Convención

Formato consistente con `docs/specs/`:
- `Estado`: `draft` | `approved` | `in-progress` | `done`
- Cada archivo con secciones `## Problema`, `## Objetivo`, `## Criterios de aceptación`, `## Hallazgos`
- Priorización por severidad → impacto → esfuerzo de remediación
