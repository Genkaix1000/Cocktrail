# Evaluación: cloud vs local para el modelo "comandera"

> **Contexto** (2026-07-27): el sistema se probó en el boliche durante 2 noches y funcionó bien — tickets, cobros con Mercado Pago (tarjetas), admin en vivo, cierre de noche. El problema es de logística/negocio: el local tiene varias barras y cajeras pero una sola tablet e impresora, y no todas las ventas pasan por la caja central, por lo que el arqueo no cierra y el esquema no les rinde. El pivot propuesto: la tablet queda como **comandera** — una sola persona sale a vender a la pista y registra sus ventas; esa parte sí arquea exacta. La pregunta: ¿conviene seguir local (mini-PC en el boliche) o mover todo a la nube con una PWA en la tablet?

## TL;DR — Recomendación: pivotar a la nube

Para el caso de uso nuevo (una tablet, un vendedor circulando por la pista), la nube gana claramente. Y el hallazgo más importante del relevamiento es que **el argumento central del local-first ya está muerto por escrito en las propias specs del proyecto**: el Posnet de Mercado Pago cobra vía la API de MP, online sí o sí. La spec de empaquetado lo confirma textual: *"internet en la compu va a estar disponible en todo momento de operación (necesario porque el Posnet cobra vía su API, no funciona offline)"*. O sea: hoy ya se depende de internet para cobrar — solo que además se paga el costo de mantener toda la infraestructura local.

## Por qué la nube encaja justo con la comandera

1. **La tablet se libera del WiFi del boliche.** Hoy la tablet necesita encontrar la mini-PC por LAN ("si la tablet no encuentra al servidor, el local no cobra", dice el propio roadmap). Un vendedor caminando por la pista de un boliche lleno es el peor escenario posible para WiFi LAN. Con cloud, la tablet opera con 4G/datos propios: cobertura en cualquier rincón.
2. **Cero inversión en hardware del local.** No hay mini-PC que comprar, montar, ni dejar prendida con BIOS configurada para cortes de luz.
3. **Se evita la Fase 6 entera, que es enorme y no está empezada.** Las dos specs de empaquetado (Windows portable + sistema de auto-updates con state machine de 10 pasos, rollback, Sentry) son drafts con **cero líneas de código escritas**. Existen únicamente porque no hay deploy: la propia spec dice que actualizar hoy exige "SSH, TeamViewer o presencia física". En cloud todo eso se reduce a un `git push`. El punto de no-retorno hacia lo local **no se cruzó** — es el momento exacto para pivotar.
4. **Mercado Pago mejora.** Todo el flujo Point ya es HTTPS saliente a `api.mercadopago.com` con polling; el lector habla con MP por su propia red, nada requiere LAN. Y los webhooks durables ya implementados (PR 3) hoy están **inertes** porque MP no puede alcanzar la LAN del boliche — en cloud se activan gratis.
5. **Se borra código, no se agrega.** El módulo sync (~700 líneas), `restoreFromCloud`, el buzón de handoff de tokens MP, el docker-compose, Kong y las demo keys desaparecen. Apuntar los repos a Supabase Cloud es literalmente cambiar 2 env vars — los 15+ repositorios son agnósticos por diseño.
6. **El QR del cliente mejora**: apunta a un dominio real, el cliente lo abre con sus datos móviles sin pedirle el WiFi del local. Y el dueño ve el admin y el cierre de noche desde su casa.

## Los contras reales de la nube (y cómo se mitigan)

- **Si se cae internet en el local, no se registran ventas** — ni en efectivo. Mitigación: la PWA comandera con cola offline (ya hay precedente en el código: `useOfflineScanQueue.ts` hace exactamente eso para canjes de tickets). Y recordar: los cobros MP ya no funcionan sin internet hoy tampoco.
- **Costo mensual** en vez de gasto único: VPS chico con proceso Node persistente (Hetzner/Fly/Railway, USD 5–15/mes) + Supabase Cloud (free tier alcanza para arrancar; Pro USD 25/mes con backups). Contra el costo de una mini-PC + el tiempo de soporte presencial, se paga solo.
- **La impresora es el único bloqueante duro de verdad.** Hoy la impresión es `writeFileSync` a `/dev/usb/lp0` — ESC/POS escrito a mano directo al USB de la máquina donde corre la API. En cloud eso muere (y ojo: degrada **en silencio**, los tickets salen `printed=false`). Pero para una comandera móvil la impresora USB fija tampoco servía: la solución natural es una **impresora térmica Bluetooth portátil** manejada desde la tablet (Web Bluetooth — el ESC/POS artesanal se reusa casi entero, solo cambia el transporte). Alternativa más simple aún: evaluar si el vendedor necesita ticket físico o si alcanza con el código en pantalla para canjear en la barra.

## Qué hay que hacer para ir a cloud (lista acotada, días no semanas)

**Restricción de arquitectura**: el SSE vive en un `EventEmitter` in-process → **VPS/contenedor con un proceso Node persistente** (Fly, Railway, Render, VPS pelado). No Vercel serverless. Con una sola instancia funciona tal cual.

**Hardening obligatorio antes de exponer a internet** (todo puntual y localizado):

- `GET /api/events` no tiene auth — hoy cualquiera en la LAN ve el stream de ventas; público sería cualquiera en internet. Hay que autenticarlo.
- Falta `app.set("trust proxy")` — sin eso el rate-limit ve a todas las tablets como una sola IP y colapsa. Fix de una línea.
- CORS y CSP están hardcodeados a rangos LAN sobre `http://`; limpiar a la URL real https.
- `proxy.ts` tiene un fallback al secreto de dev si falta la env (la API muere sin secreto, el proxy no) — hacerlo fail-closed.
- Desactivar el auto-healing del boot (`exec("supabase start")` no tiene sentido en un VPS).
- Cookie `Secure` (garantizar `NODE_ENV=production`) y mantener el rewrite same-origin de Next (`API_PROXY_TARGET`), que ya está diseñado para esto.

**Trabajo nuevo**: la PWA no existe (cero manifest, cero service worker) — hay que armarla, pero es greenfield sin bloqueantes. Y la impresión Bluetooth si se decide que hay ticket físico.

**Dato para la comandera**: los roles reales hoy son 2 (`admin | caja`; barman se retiró el 13/07). Una sola comandera funciona con el modelo actual (la pantalla `/caja` es la comandera, con una barra configurada). Si mañana se quieren **varios vendedores simultáneos**, ahí sí hay que tocar: sacar `BAR_CODE` de la env, derivar la barra de la sesión de usuario y relajar el `UNIQUE(bar_id)` de `bar_sessions`. La DB ya modela N barras/cajas — el límite es solo del runtime.

## En resumen

| | Local (mini-PC) | Cloud (VPS + Supabase Cloud) |
|---|---|---|
| Cobros MP | Requiere internet igual | Requiere internet (sin cambio) |
| Venta en pista | Depende del WiFi del local | Tablet con 4G, cualquier rincón |
| Inversión inicial | Mini-PC + montaje + Fase 6 entera (no empezada) | Hardening (días) + PWA |
| Updates/soporte | SSH/TeamViewer/presencial + spec updater completa | `git push` |
| Costo recurrente | $0 | ~USD 5–40/mes |
| Impresora | USB directa (ya anda, pero fija) | Bluetooth portátil o sin ticket físico |
| Webhooks MP | Inertes (NAT) | Se activan |

**Próximo paso sugerido**: si el modelo comandera convence como negocio, escribir la spec (`deploy-cloud-comandera`) que fije las decisiones — dónde hostear, qué pasa con el ticket físico, y la cola offline de la PWA.
