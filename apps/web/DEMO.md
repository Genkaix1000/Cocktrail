# Demo miBoliche (estática)

Branch `demo/miboliche` — UI = shell Bosko (sidebar, light/dark), skin **miBoliche**, **sin API ni DB**.

```bash
# ya hay apps/web/.env.local con NEXT_PUBLIC_DEMO_STATIC=1
pnpm --filter cocktrail-app dev
```

Abrí http://localhost:3000/login → clave `demo` → elegí Admin o Caja.

- Banner violeta: links Admin/Caja + Resetear
- Carta con fotos de `/public/drinks`
- Día/noche: toggle en topbar / login
- `develop` (producción Bosko) no se toca en deploy

Para volver a Bosko real: `git checkout develop` y corré api+web+supabase como siempre.
