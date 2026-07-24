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

## Si algo se rompe

| Síntoma | Acción |
|---|---|
| Tablet no ve el server | Verificar IP (`ip addr`), misma red WiFi, `pnpm dev` vivo |
| Cobro Posnet no llega al aparato | `/admin` → PDV y Posnets → salud; ¿Posnet con WiFi? ¿modo PDV? |
| "Caja sin Posnet vinculado" | `/admin` → PDV y Posnets → vincular el lector a la caja |
| Se cerró la pestaña con un QR en curso | El pago puede existir en MP: revisar la app de MP; registrar la venta a mano si corresponde |
| Server se reinició | `pnpm dev` de nuevo — la noche y las ventas están en Postgres, no se pierde nada |
