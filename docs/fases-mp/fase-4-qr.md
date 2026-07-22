# Plan MP — Fase 4: Cobro QR Estático

> **Docs relevantes**: [`docs/mp/api-orders-qr.md`](../mp/api-orders-qr.md)

### A) ¿Qué se hace?

Implementar el cobro por QR usando la Orders API de MP con `type: "qr"` y `mode: "static"`. Re-agregar el botón "Código QR" en `/caja` (esta vez con implementación real).

### B) ¿Por qué?

Es el Paso 3a del spec [`docs/specs/mercadopago/integracion-mp.md`](../specs/mercadopago/integracion-mp.md) § "Operación de cobro — QR estático". La decisión de diseño (ver [`docs/mp/INDEX.md`](../mp/INDEX.md) § "Decisiones de diseño clave") es usar el modelo estático: cada barra tiene su QR fijo impreso, y al crear una order ese QR se "carga" con el monto. El cliente siempre escanea el mismo QR. Esto es más simple que el modelo dinámico y no requiere generar una imagen nueva por cada cobro.

Esta fase introduce la tabla `mp_orders` (no incluida en el modelo de datos base de Fase 0 porque es específica al flujo de Orders API y no la requieren las fases de OAuth ni provisioning). La tabla persiste `order_id_mp`, `payment_transaction_id` (al crear), `payment_id` (al concretarse), `idempotency_key`, `external_reference`, y `status` para el polling + reconciliación por webhook (Fase 6).

### C) Implementación

**Docs**: [`docs/mp/api-orders-qr.md`](../mp/api-orders-qr.md)

**C.0) Migración: `mp_orders`**

```sql
CREATE TABLE mp_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id_mp            TEXT NOT NULL,           -- "ORD01K371..." (response.id al crear)
  external_ref           TEXT NOT NULL,           -- "COCKTRAIL-ORDER-{ts}" (máx 64 chars, sin PII)
  idempotency_key        TEXT NOT NULL,           -- UUID usado en X-Idempotency-Key al crear
  payment_transaction_id TEXT,                    -- transactions.payments[0].id (al crear la order)
  payment_id             TEXT,                    -- ID real del pago (reference_id en consulta/webhook)
  amount                 NUMERIC(12,2) NOT NULL,
  status                 TEXT NOT NULL            -- created|processed|canceled|refunded|expired
                           CHECK (status IN ('created','processed','canceled','refunded','expired')),
  type                   TEXT NOT NULL,           -- 'qr' | 'point'
  bar_id                 TEXT,
  caja_id                UUID REFERENCES mercadopago_cajas(id),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mp_orders_external_ref ON mp_orders(external_ref);
CREATE INDEX idx_mp_orders_payment_id    ON mp_orders(payment_id);
```

**C.1) `POST /api/mercadopago/orders/qr`** — crear order QR estática

```
SERVICE: createQrOrder(opts)
  credentialsResolver.resolve({ allowGlobalFallback: true }) → token
  caja = cajasRepo.findByBarId(opts.barId)
  IF NOT caja → 409 "Barra sin caja MP configurada. Ejecutar Fase 3 primero."

  external_ref = "COCKTRAIL-{ts}-{random4}"  // ⚠ máx 64 chars, sin PII
  idempotency_key = randomUUID()
  amount_str = opts.amount.toFixed(2)

  response = POST https://api.mercadopago.com/v1/orders
    Authorization: Bearer {token}
    X-Idempotency-Key: {idempotency_key}
    BODY: {
      type:               "qr",
      external_reference: external_ref,
      total_amount:       amount_str,
      description:        opts.description,
      expiration_time:    "PT15M",
      config: {
        qr: {
          external_pos_id: caja.external_pos_id,  // ⚠ match exacto con el POS en MP
          mode:            "static"                // QR fijo, no dinámico
        }
      },
      transactions: {
        payments: [{ amount: amount_str }]
      },
      items: [{
        title: "Consumo {caja.name}",
        unit_price: amount_str,
        quantity: 1,
        unit_measure: "unit"
      }]
    }

  // ⚠ payments[0].id es la transaction, NO el payment_id real.
  //    El payment_id real llega en reference_id al consultar/webhook.
  mpOrdersRepo.create({
    order_id_mp:            response.id,
    external_ref:           external_ref,
    idempotency_key:        idempotency_key,
    payment_transaction_id: response.transactions.payments[0].id,
    amount:                 amount_str,
    status:                 "created",
    type:                   "qr",
    bar_id:                 opts.barId,
    caja_id:                caja.id
  })

  RETURN {
    orderId:    response.id,
    qrImage:    caja.qr_image,   // QR estático del POS — no cambia
    status:     "created",
    expiresAt:  NOW + 15min
  }
```

**Errores clave**:
- `pos_not_found` (400) → el `external_pos_id` no existe en MP. La caja no fue creada o el ID no coincide.
- `idempotency_key_already_used` (409) → la key ya se usó en las últimas 24h. Si el body es **idéntico** al request original, MP devuelve el mismo resultado (idempotente). Si es distinto, genera nueva UUID.

**C.2) `GET /api/mercadopago/orders/{orderId}/status`** — polling con consulta a MP

```
SERVICE: getOrderStatus(orderId, barId)
  order = mpOrdersRepo.findByMpId(orderId)
  IF NOT order → 404

  // Si el estado local es final, devolverlo directo
  IF order.status IN ("processed", "canceled", "refunded", "expired")
    RETURN order

  // Estado pendiente → consultar MP para actualizar (cubre webhook caído)
  token = credentialsResolver.resolve({ barId })
  mpOrder = GET https://api.mercadopago.com/v1/orders/{orderId}
    Authorization: Bearer {token}

  // Mapear estado de MP → estado interno
  newStatus = mpOrder.status
  paymentId = mpOrder.transactions?.payments?.[0]?.id ?? null

  mpOrdersRepo.update(orderId, {
    status:     newStatus,
    payment_id: paymentId  // ⚠ este es el payment_id REAL
  })

  RETURN { ...order, status: newStatus }
```

**Estados** (incluyen `expired` que no estaba en la versión inicial):

| Status | Significado | Acción en UI |
|--------|-------------|-------------|
| `created` | Esperando que el cliente escanee | Seguir polling |
| `processed` | Pago completado | Concretar pedido ✅ |
| `canceled` | Cancelada (por API o dispositivo) | Volver al selector ❌ |
| `refunded` | Reembolsada | Marcar en historial |
| `expired` | Expiró por `expiration_time` | Volver al selector ❌ |

**C.3) `POST /api/mercadopago/orders/{orderId}/cancel`**

```
SERVICE: cancelQrOrder(orderId, barId)
  order = mpOrdersRepo.findByMpId(orderId)
  IF order.status != "created" → 409 "Solo cancelable en estado 'created'"

  token = credentialsResolver.resolve({ barId })
  POST https://api.mercadopago.com/v1/orders/{orderId}/cancel
    Authorization: Bearer {token}
    X-Idempotency-Key: {randomUUID()}

  mpOrdersRepo.updateStatus(orderId, "canceled")
  RETURN { status: "canceled" }
```

**C.4) Refactor de `mpOrdersRepo`** — campos nuevos

Respecto a la versión anterior:

| Campo | Antes | Ahora | Por qué |
|-------|-------|-------|---------|
| `payment_id_mp` | Guardaba `transactions.payments[0].id` al crear | Se parte en dos: `payment_transaction_id` + `payment_id` | El ID al crear es la transacción, no el pago real. El payment_id real llega en `reference_id` al consultar/webhook. |
| `idempotency_key` | No se guardaba | Se persiste junto con `external_ref` | Permite reintento seguro si el backend cortó post-request (misma key + mismo body → MP devuelve resultado idempotente). |
| `status` CHECK | Sin CHECK | `CHECK (IN 'created','processed','canceled','refunded','expired')` | `expired` se agregó — las orders expiran automáticamente por `expiration_time`. |
| `updated_at` | No existía | `TIMESTAMPTZ DEFAULT NOW()` | Auditoría de cuándo cambió el estado. |
| Índices | No tenía | `idx_mp_orders_external_ref`, `idx_mp_orders_payment_id` | Búsquedas por referencia externa (webhook) y por payment_id (conciliación). |

**C.5) Frontend — `VentaSection.tsx` + `useCheckout.ts`**

Re-agregar botón "Código QR" en el selector de métodos de cobro (junto a Efectivo y Tarjeta). El flujo:

```
paymentMethod === "qr":
  1. mostrar estado "Esperando pago QR..."
  2. llamar POST /api/mercadopago/orders/qr { amount, barId }
  3. polling cada 3s → GET /api/mercadopago/orders/{orderId}/status
     El endpoint consulta MP si el estado local sigue en "created".
  4. status "processed" → concretar pedido (ordersService.create, paymentMethod: "qr")
  5. status "canceled" / "expired" → mostrar error, volver al selector
```

**Nota**: `"qr"` ya es un valor válido de `PaymentMethod` en `packages/shared/src/domain.ts` (usado por `/carta` y reportes de `/admin`). No se modifica el tipo compartido.
