# Specs — Spec-Driven Development (nativo)

Cada feature no trivial vive en un archivo `docs/specs/<slug>.md` que evoluciona en 3 capas
(spec → plan → tareas) generadas con los slash-commands de `.claude/commands/`.

## Flujo

```
brainstorming (skill, opcional)   →  explorar el intent
/spec  <feature>                  →  el QUÉ y el POR QUÉ (sin stack)
/plan  <slug>                     →  plan técnico (archivos, datos, riesgos)
/tasks <slug>                     →  checklist accionable
implementar (Plan Mode si es grande) → ir tildando las tareas
```

## Por qué nativo y no Spec Kit / OpenSpec

Para este MVP, Spec Kit es overkill (phase gates rígidos + setup Python) y OpenSpec agrega una
dependencia. El flujo nativo nos da el 90%: `CLAUDE.md`/`AGENTS.md` actúan como "constitution",
Plan Mode como fase de plan, y la skill `brainstorming` como exploración previa.
Si las specs se vuelven inmanejables en chat, evaluar subir a **OpenSpec** (lightweight, brownfield).
Ver `docs/AGENTS.md`.

## Convención de archivo

- `slug` en kebab-case (ej. `pedido-online-web.md`).
- Estado en el header: `draft` → `approved` → `in-progress` → `done`.
- Una feature = un archivo, con secciones `## Problema`, `## Objetivo`, `## Criterios de aceptación`,
  `## Plan técnico`, `## Tareas`.
