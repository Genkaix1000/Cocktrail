# Runbook — Prueba en el boliche real · viernes 25-07 a la noche

> Corto y al pie. La notebook corre todo; la tablet entra por LAN. No hace falta el empaquetado (Fase 6).

## HOY (antes de ir) — ~30 min

> Lo ya resuelto hoy 24-07 no está acá: el mini-gate QR **pasó** (2 pagos exactos + cancelado sin
> venta, asentado en el ROADMAP), la decisión de la plata está tomada (cuenta de Manuel, migración
> después — ver sección más abajo), y la limpieza selectiva de las 155 noches quedó **superada** por
> el reset total (el dueño quiere arrancar mañana con todo a cero: Historial vacío, primera noche
> real la del boliche).

- [ ] **Cerrar la noche de prueba de hoy** si sigue abierta (`/admin` → Cerrar Noche).
- [ ] **Reset total** (todo a cero — borra noches/ventas/cobros MP, conserva catálogo y config MP):

  ```bash
  pnpm --filter cocktrail-api db:reset --target=cloud   # confirmación tipeada
  pnpm --filter cocktrail-api db:reset --target=local   # confirmación tipeada
  ```

  Después: **reiniciar el server** (re-siembra el usuario `admin`) y **re-crear el usuario de
  `caja` a mano** desde `/admin` (ese no se re-siembra).
- [ ] **`/admin` → PDV y Posnets**: salud en verde y QR presente — el reset **NO** toca la config
  MP (sellers/cajas/devices). **Imprimir el QR** para el mostrador.
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
| **Noches vacías en Cloud** (las ~155 de $0 que dejaron los tests) | `cd apps/api && pnpm exec tsx src/scripts/cleanup-empty-nights.ts --target=cloud` (pide confirmación tipeada) | **Superada** por el reset total de hoy 24-07 (borra esas noches y todo lo demás) |
| Noches vacías locales | ídem con `--target=local` | Después de correr suites de integración (R16) — sigue útil |
| **Reset TOTAL local** (borra noches/ventas/cobros MP y `mp_webhook_events`; conserva catálogo, bars y config MP —sellers/cajas/devices—; `users` se re-siembra: admin en el próximo boot, el de `caja` a mano desde `/admin`) | `pnpm --filter cocktrail-api db:reset --target=local` | **Hoy 24-07** (arrancar la prueba a cero) |
| **Reset TOTAL de Cloud** ⚠️ (mismas tablas; `mp_webhook_events` no existe en Cloud y se saltea sola) | `pnpm --filter cocktrail-api db:reset --target=cloud` (confirmación tipeada) | **Hoy 24-07** (todo a cero para la prueba) y de nuevo **el día de la entrega real** (borrar los datos de la prueba) |
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
