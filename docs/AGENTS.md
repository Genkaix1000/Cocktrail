# Subagents & Skills — Cocktrail / BarQR

Catálogo de los agentes y skills del proyecto, y el plan para sumar más.
Los subagents project-scoped viven en `.claude/agents/`. Las skills "package-managed" en `.agents/skills/` (lockfile `skills-lock.json`).

---

## Subagents project-scoped (`.claude/agents/`)

| Agent | Cuándo usarlo |
|---|---|
| `expert-nextjs-developer` | Código Next.js 16 (App Router, route handlers, async params, proxy, server/client components, caching). |
| `expert-react-frontend-engineer` | Client components, hooks, state, accesibilidad, perf en React 19.2. |
| `architect-reviewer` | Cambios estructurales: boundaries, SOLID, acoplamiento, capas. |
| `supabase-expert` ⭐nuevo | Migraciones, RLS, esquema y el sync local↔cloud. Tocar `supabase/migrations/`, `Supabase*Repository`, `shared/supabase.ts`, módulo `sync`. |
| `mercadopago-integrator` ⭐nuevo | Cobros MP: Point/Posnet (hoy) y checkout online (Phase 2). Contexto Argentina. |
| `e2e-playwright-tester` ⭐nuevo | Verificación E2E de los 4 flujos vía Playwright MCP (sin instalar `@playwright/test`). |

> Code review y buenas prácticas generales ya están cubiertos por la skill global `code-reviewer`,
> `architect-reviewer`, y los `expert-*` / `senior-*`. No duplicar con genéricos externos.

## Skills — dos ubicaciones (¡importante!)

Hay **dos** carpetas de skills y **Claude Code solo lee una**:

- **`.claude/skills/`** ← **Claude Code SÍ detecta estas** (project skills). Están gitignoradas (locales).
- **`.agents/skills/`** + `skills-lock.json` ← gestionadas por el package manager `skills` (`npx skills add …`), **versionadas/compartidas con el equipo**, pero **Claude Code NO las detecta** nativamente. Sirven a otros harnesses / como fuente canónica.

Por eso, los skills que queremos que Claude use los **copiamos** a `.claude/skills/` (quedan locales; la fuente versionada sigue en `.agents/skills/`).

| Skill | En `.claude/skills/`? | Fuente | Para qué |
|---|---|---|---|
| `supabase` | ✅ copiada | `supabase/agent-skills` (oficial) | Database, Auth, Edge Functions, Realtime, Storage + guardrails de seguridad (RLS bypass, `security_invoker`). |
| `supabase-postgres-best-practices` | ✅ copiada | `supabase/agent-skills` | Índices, RLS performance, pooling, particionado, batch inserts. |
| `design-taste-frontend`, `gpt-taste`, `minimalist-ui`, `full-output-enforcement` | ⬜ solo en `.agents/skills` | `Leonxlnx/taste-skill` | Estética/UI del frontend. Copiar a `.claude/skills/` si se quiere usarlas en UI (ojo: `full-output-enforcement` cambia el comportamiento de salida). |

- **Agregar una skill nueva (versionada)**: `npx -y skills add <owner/repo> --skill <nombre> --agent claude-code` (actualiza `.agents/skills/` + `skills-lock.json`), y luego `cp -r .agents/skills/<nombre> .claude/skills/<nombre>` para que Claude la detecte.
- **Routing**: qué agente/skill usar según la tarea está en `CLAUDE.md` §4.

---

## Estado de la mejora de agentes (2026-06-30)

**Hecho ahora (set "ahora"):**
- ✅ Skill Supabase oficial — ya presente vía `skills-lock.json`.
- ✅ Subagents nuevos: `supabase-expert`, `mercadopago-integrator`, `e2e-playwright-tester`.
- ✅ Catálogo y convenciones documentadas (este archivo).

**Decisiones explícitas pendientes (no instalado para no inflar el repo):**

| Qué | Cómo | Cuándo |
|---|---|---|
| **Playwright E2E "de verdad"** (planner/generator/healer oficiales + archivos de test versionados) | `pnpm --filter cocktrail-app add -D @playwright/test` → `playwright install --with-deps` → `playwright init-agents --loop=claude`. Agrega dep + binarios (~cientos de MB). | Cuando queramos suite E2E versionada. Mientras tanto, usar el subagent `e2e-playwright-tester` con el MCP. |
| **Plugin oficial Mercado Pago** | `/plugin marketplace add https://github.com/mercadopago/mercadopago-claude-marketplace.git` → `/plugin install mercadopago@...`. Skills `mp-integrate`/`mp-webhooks`/`mp-review`. **Requiere MCP + OAuth** (no offline). | **Phase 2** (checkout online). Para el Point/Posnet actual no hace falta. |
| **Marketplace `wshobson/agents`** (36k⭐, MIT) | `/plugin marketplace add wshobson/agents` → instalar plugins puntuales (ej. `comprehensive-review`). | Si querés una 2ª opinión de review o llenar un hueco puntual. |
| **OpenSpec** (SDD lightweight) | herramienta brownfield, slash-commands en Claude Code. | Solo si el SDD nativo (`/spec /plan /tasks`) se queda corto. |

## Fuentes (verificadas 2026-06-30)

- Supabase: https://github.com/supabase/agent-skills
- Mercado Pago: https://github.com/mercadopago/mercadopago-claude-marketplace (Apache-2.0)
- Playwright agents: https://playwright.dev/docs/test-agents
- wshobson/agents: https://github.com/wshobson/agents (MIT)
- VoltAgent (cantera de `.md`): https://github.com/VoltAgent/awesome-claude-code-subagents
- anthropics/skills (referencia de formato): https://github.com/anthropics/skills
- SDD: https://github.com/github/spec-kit · https://github.com/Fission-AI/OpenSpec
