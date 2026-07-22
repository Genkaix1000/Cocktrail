# Plan MP — Fase 6: Webhooks

> **Docs relevantes**: [`docs/mp/api-orders-qr.md`](../mp/api-orders-qr.md), [Configurar notificaciones de Orders (QR)](https://www.mercadopago.com.ar/developers/es/docs/qr-code/notifications), [Obtener order por ID](https://www.mercadopago.com.ar/developers/es/reference/in-person-payments/qr-code/orders/get-order/get)

### A) ¿Qué se hace?

Exponer un endpoint público `POST /api/mercadopago/webhooks` que reciba notificaciones de MP (evento `order` — no `merchant_order`/`payment` legacy), valide la firma HMAC del header `x-signature`, consulte el estado real contra `GET /v1/orders/{order_id}`, e impacte el pedido en Cocktrail. La configuración del webhook se hace en el panel de MP, una sola vez.

### B) ¿Por qué?

Es el Paso 4 del spec [`docs/specs/mercadopago/integracion-mp.md`](../specs/mercadopago/integracion-mp.md) § "Conciliación". Sin webhooks, la única forma de saber si un QR se pagó es haciendo polling desde el frontend — frágil (el cajero cierra la pantalla, se pierde la conexión). Con webhooks, MP notifica al backend y el pedido se concreta aunque el frontend ya no esté escuchando. La validación contra la API de MP antes de impactar es obligatoria: nunca se debe confiar ciegamente en el body del webhook. La validación HMAC del `x-signature` evita que cualquiera inyecte notificaciones falsas.

### C) Configuración en el panel de MP (admin, una sola vez)

1. **Tus integraciones** > seleccionar la app > **Webhooks > Configurar notificaciones**
2. Pestaña **Modo productivo**, URL: `https://cocktrail.com/api/mercadopago/webhooks` (o URL del túnel para dev)
3. Evento: **Order (Mercado Pago)** — tópico `order`
4. Guardar → genera una **clave secreta** que se usa para validar HMAC. Guardarla en `.env` como `MP_WEBHOOK_SECRET`.

**Formato de la notificación recibida** (POST a nuestra URL):

```
POST /api/mercadopago/webhooks?data.id=ORD01JV3AW3NFSTSTB669F41NACDX&type=order
Headers:
  x-signature: ts=1742505638683,v1=ced36ab6d33566bb1e16c125819b8d840d6b8ef136b0b9127c76064466f5229b
  x-request-id: 2066ca19-c6f1-498a-be75-1923005edd06
Body:
{
  "action": "order.processed",
  "api_version": "v1",
  "application_id": "7364289770550796",
  "data": { "id": "ORD01JV3AW3NFSTSTB669F41NACDX" },
  "date_created": "2025-05-12T22:46:59.635Z",
  "live_mode": false,
  "type": "order",
  "user_id": "1403498245"
}
```

**Eventos posibles** (campo `action`):

| `action` | Significado | Acción en Cocktrail |
|----------|-------------|---------------------|
| `order.processed` | Pago completado | Concretar pedido ✅ |
| `order.canceled` | Cancelada vía API | Cancelar pedido ❌ |
| `order.refunded` | Reembolsada (total — el partial llega como `status=processed` + `status_detail=partially_refunded`) | Marcar reembolso 🔄 |
| `order.expired` | Expiró por `expiration_time` | Cancelar pedido ❌ |

### D) Implementación

**D.1) `POST /api/mercadopago/webhooks`** — público, sin auth de sesión (solo HMAC)

```
SERVICE: handleWebhook(req)

  // ── 1) Validar firma HMAC ──
  xSignature = req.headers["x-signature"]
  xRequestId = req.headers["x-request-id"]
  dataId = req.query["data.id"]  // ⚠ del query param, no del body

  IF NOT validarFirma(xSignature, xRequestId, dataId, env.MP_WEBHOOK_SECRET)
    → 401 Unauthorized

  // ── 2) Extraer order_id y evento ──
  // ⚠ data.id es CANÓNICO desde req.query (no confiar en body)
  type = req.query["type"]
  action = req.body.action
  orderId = dataId  // ya validado en el paso 1 desde req.query["data.id"]

  IF type != "order" OR !orderId
    → 200 OK (ignorar — no es nuestro evento)

  // ── 3) Responder 200 rápido, encolar trabajo pesado ──
  // MP espera respuesta en <22s. Validación HMAC ya pasó.
  // Encolar el resto async para no bloquear la respuesta.
  RESPONSE → 200 OK (inmediato)
  queue.enqueue({ orderId, action })

  // ── 4) Job async: validar contra API de MP ──
  mpOrder = mpOrdersRepo.findByMpId(orderId)
  IF NOT mpOrder → RETURN (order de otro sistema)

  token = credentialsResolver.resolve({ allowGlobalFallback: true })
  result = GET https://api.mercadopago.com/v1/orders/{orderId}
    Authorization: Bearer {token}

  // ⚠ Mapeo de IDs: el payment_id REAL está en transactions.payments[].reference_id
  //    (NO en transactions.payments[].id, que es el ID de transacción interno)
  paymentId = result.transactions?.payments?.[0]?.reference_id ?? null

  // ── 5) Actualizar mp_orders con estado real ──
  mpOrdersRepo.update(orderId, {
    status:     result.status,
    payment_id: paymentId
  })

  // ── 6) Impactar pedido en Cocktrail ──
  CASE result.status OF
    "processed" → concretarPedido(mpOrder, result)
    "canceled"  → cancelarPedido(mpOrder)
    "expired"   → cancelarPedido(mpOrder)
    "refunded"  → marcarReembolso(mpOrder)
```

**D.2) Validación HMAC**

```
FUNCTION: validarFirma(xSignature, xRequestId, dataId, secret)

  // Parsear ts y v1 del header x-signature: "ts=123,v1=abc"
  ts = extraer(xSignature, "ts")
  hash = extraer(xSignature, "v1")

  // Construir manifest: "id:{dataId} request-id:{xRequestId} ts:{ts}"
  // ⚠ Separador: ESPACIOS entre partes (no ;). La doc oficial usa espacios.
  // ⚠ dataId debe ir en minúsculas
  // ⚠ Si algún valor no está presente, se omite del manifest
  parts = []
  IF dataId → parts.push("id:" + dataId.toLowerCase())
  IF xRequestId → parts.push("request-id:" + xRequestId)
  parts.push("ts:" + ts)
  manifest = parts.join(" ")  // espacios, NO ";"

  // Calcular HMAC-SHA256 en hex
  computed = HMAC_SHA256(secret, manifest).hex()

  // Comparación timing-safe
  RETURN timingSafeEqual(computed, hash)
```

**D.3) `concretarPedido(mpOrder, result)` / `cancelarPedido(mpOrder)` / `marcarReembolso(mpOrder)`**

```
concretarPedido(mpOrder, result):
  order = ordersRepo.findByExternalRef(mpOrder.external_ref)
  IF order AND order.status == "pending"
    // payment_method según el tipo de order (no hardcoded)
    method = result?.type === "point" ? "debito" : "qr"
    ordersRepo.update(order.id, {
      status:         "completed",
      payment_method: method,
      mp_payment_id:  mpOrder.payment_id
    })
    sseService.emit("order.completed", order)

cancelarPedido(mpOrder):
  order = ordersRepo.findByExternalRef(mpOrder.external_ref)
  IF order AND order.status == "pending"
    ordersRepo.update(order.id, { status: "cancelled" })
    sseService.emit("order.cancelled", order)

marcarReembolso(mpOrder):
  order = ordersRepo.findByExternalRef(mpOrder.external_ref)
  IF order
    ordersRepo.update(order.id, { status: "refunded" })
    sseService.emit("order.updated", order)
    sseService.emit("order.updated", order)
```

**D.4) Estados de la order (referencia)**

| `status` | `status_detail` | Significado |
|-----------|-----------------|-------------|
| `created` | `created` | Creada, esperando pago |
| `processed` | `accredited` | Pagada y acreditada |
| `processed` | `partially_refunded` | Reembolso parcial |
| `refunded` | `refunded` | Reembolso total |
| `expired` | `expired` | No se pagó a tiempo |
| `canceled` | `canceled_by_api` | Cancelada vía API |

**D.5) Mapeo de IDs (clave para `mp_orders`)**

| Campo en response de `GET /v1/orders/{id}` | Campo en `mp_orders` | Nota |
|---|---|---|
| `id` | `order_id_mp` | ID de la order en MP |
| `external_reference` | `external_ref` | Nuestro ID de Cocktrail |
| `status` | `status` | Estado real de la order |
| `transactions.payments[0].id` | `payment_transaction_id` | ID de transacción (al crear) |
| `transactions.payments[0].reference_id` | `payment_id` | ⚠ ID REAL del pago (al concretarse) |

**D.6) Variables de entorno nuevas**

```env
# apps/api/.env
MP_WEBHOOK_SECRET=<clave-secreta-del-panel-mp>
```

### E) Notas

- El evento `payment` (legacy) **no** se usa como fuente principal para conciliar Orders. Si se recibe, solo para logging.
- Siempre responder `200 OK` en menos de 22 segundos. Si no, MP reintenta cada 15 min (3 intentos, luego se espacia). Por eso el endpoint hace validación HMAC + responde 200 inmediato, y el trabajo pesado (GET /v1/orders/{id} + updates) se encola async.
- `live_mode` viene en el body del webhook (`false` en sandbox, `true` en producción). Solo para logging — no usar en lógica de negocio.
- El reembolso **parcial** no llega como `order.refunded` sino como `status=processed` + `status_detail=partially_refunded`. Se detecta al consultar `GET /v1/orders/{id}`.
- `canceled_by_api` es el `status_detail` de la transacción, no de la order. Para decisiones de negocio usar `result.status` (order), no `transactions.payments[0].status_detail`.
- Si el body del webhook no trae todos los datos, consultar `GET /v1/orders/{id}` — es la fuente de verdad.
- `data.id` viene en el **query param** de la URL (`?data.id=...`), no solo en el body.
