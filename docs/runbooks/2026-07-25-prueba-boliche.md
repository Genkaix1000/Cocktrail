# Runbook — Prueba en el boliche real · viernes 25-07 a la noche

> Corto y al pie. La notebook corre todo; la tablet entra por LAN. No hace falta el empaquetado (Fase 6).

## HOY (antes de ir) — ~30 min

- [ ] **Mini-gate QR** (da el QR por validado): desde `/caja`,
  1. cobro QR → pagar con un celu/cuenta que **no** sea la del seller (MP rechaza auto-pagos) → confirma y sale ticket;
  2. cobro QR sin pagar → cancelar/expirar → **no** se registra venta;
  3. en `/admin`, el total sumó exactamente el monto pagado.
- [ ] **`/admin` → PDV y Posnets**: salud en verde, `COCKTRAILBAR01` con QR y sin marca de huérfana. **Imprimir el QR** para el mostrador.
- [ ] **Limpiar las 155 noches $0 de Cloud** (basura de tests) para que el Historial se vea real.
- [ ] **Usuarios**: confirmar las credenciales de `caja` que va a usar la gente del boliche (y no compartir la de `admin`).
- [ ] **Plata**: confirmar con el dueño que mañana los cobros MP entran a la cuenta de Manuel (`1517393956`) y después se transfieren. La migración a su cuenta es procedimiento aparte (ver ROADMAP → "Pendientes para producción").
- [ ] **Bolso**: Posnet + cargador · impresora + **2 rollos** · notebook + cargador · QR impreso · cable USB impresora.

## MAÑANA al llegar — ~15 min

1. Notebook enchufada, **suspensión deshabilitada**.
2. `docker compose up -d` → `pnpm dev`. Verificar que levanta sin errores.
3. Anotar la **IP LAN** de la notebook (`ip addr`). En la tablet: `http://<IP>:3000/caja` → login caja. Dejarla a pantalla completa.
4. **Posnet**: conectarlo al **WiFi del local** (en 3G se cuelga "Procesando…"). En `/admin` → PDV y Posnets: salud verde.
5. **Impresora**: USB + botón de test desde `/caja`. Mirar que el rollo tenga papel.
6. **Smoke test antes de abrir**: un cobro Posnet de $1 y uno QR → ticket sale → se ven en `/admin`. (Se pueden anular cerrando esa mini-noche de prueba antes de abrir la real… o dejarlos, son $2.)
7. `/admin` → **Abrir Noche** (palabra clave).

## Durante la noche

- **QR**: la pestaña de `/caja` queda **abierta** hasta que confirme cada cobro (el polling vive ahí). No navegar en el medio de un cobro.
- **Posnet colgado en "Procesando…"**: esperar 1-2 min o reiniciarlo. El cobro se verifica server-side igual — la venta solo se registra si MP confirmó.
- **Impresora**: no avisa cuando se queda sin papel (R8) — mirar el rollo cada tanto.
- **Cobro cae / duda**: si el sistema dice `PAYMENT_REJECTED` o `PAYMENT_UNVERIFIED`, la venta NO se registró — cobrar de nuevo. Nunca entregar contra "el aparato dijo que sí" si la app dice que no.

## Al cierre

1. `/admin` → **Cerrar Noche**. Con internet, el sync a Cloud sale solo (noche + ventas + cobros MP).
2. Verificar en `/admin` que el resumen cuadre (efectivo vs Posnet vs QR).
3. Si algo del sync falló, no pasa nada: queda `pending` y reintenta al próximo arranque con internet.

## Limpieza de datos — scripts (correr desde la raíz del repo)

> El stack local (Docker `cocktrail-db` + rest + kong) no se toca: los scripts operan sobre los datos.

| Qué limpia | Comando | Cuándo |
|---|---|---|
| **Noches vacías en Cloud** (las ~155 de $0 que dejaron los tests — ensucian el Historial y cada restore las trae de vuelta) | `cd apps/api && pnpm exec tsx src/scripts/cleanup-empty-nights.ts --target=cloud` (pide confirmación tipeada) | **Hoy**, antes de la prueba |
| Noches vacías locales | ídem con `--target=local` | Después de correr suites de integración (R16) |
| **Reset TOTAL local** (borra pedidos/noches/cobros, conserva catálogo y usuarios) | `pnpm --filter cocktrail-api db:reset --target=local` | Opcional antes de la prueba, para arrancar con historial limpio |
| **Reset TOTAL de Cloud** ⚠️ | `pnpm --filter cocktrail-api db:reset --target=cloud` (confirmación tipeada) | **Recién el día de la entrega real** — NO ahora (se pierden los datos de prueba útiles) |
| Comparar local vs Cloud (sanidad del sync) | `pnpm --filter cocktrail-api verify-sync` | Después de un cierre, si hay dudas |

## Migración a la cuenta del dueño — cuándo se haga (NO mañana; decidido 24-07)

> La plata de la prueba entra a la cuenta de Manuel (`1517393956`) y se transfiere después.
> La migración se hace con calma otro día, con el dueño presente. Funciona igual si la cuenta
> es personal del dueño o del negocio — lo único: los pasos 2 y 4 los hace **el titular**.

1. **Manuel** saca el lector de su app de MP: Configuración del lector → **"Eliminar el lector de mi cuenta"**.
2. **El dueño** reclama el lector desde SU app de MP (paso manual irreductible — MP no tiene API para transferir hardware).
3. Verificar en la app del dueño que el lector aparezca y **ponerlo en modo PDV** (o después desde `/admin`, que tiene el botón).
4. **El dueño** vincula su cuenta por **OAuth** en `/admin` → Pagos ("Vincular Mercado Pago"), **con sus propias credenciales** (no un colaborador — supuesto no verificado).
5. **Desvincular** el seller viejo de Manuel (botón Desvincular en `/admin` → Pagos) si el paso 4 no lo reemplazó solo.
6. `/admin` → PDV y Posnets: la caja va a figurar **huérfana** → **Re-provisionar** (crea store/POS en la cuenta nueva). ⚠️ **El QR estático CAMBIA** → imprimir el nuevo y tirar el viejo.
7. Vincular el lector a la caja desde PDV y Posnets; salud en verde.
8. **Re-gates completos contra la cuenta nueva**: un cobro Posnet real + el mini-gate QR (pago con otro celu / no-pago / monto). Sin esto no se opera.
9. Verificar en la app de MP **del dueño** que la plata de las pruebas entró ahí.

## Si algo se rompe

| Síntoma | Acción |
|---|---|
| Tablet no ve el server | Verificar IP (`ip addr`), misma red WiFi, `pnpm dev` vivo |
| Cobro Posnet no llega al aparato | `/admin` → PDV y Posnets → salud; ¿Posnet con WiFi? ¿modo PDV? |
| "Caja sin Posnet vinculado" | `/admin` → PDV y Posnets → vincular el lector a la caja |
| Se cerró la pestaña con un QR en curso | El pago puede existir en MP: revisar la app de MP; registrar la venta a mano si corresponde |
| Server se reinició | `pnpm dev` de nuevo — la noche y las ventas están en Postgres, no se pierde nada |
