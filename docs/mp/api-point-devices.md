# API — Point Integration (Posnet / Terminal Física) — LEGACY

> **Cuándo leer esto**: cuando necesitás interactuar con una terminal Point física usando el **sistema actual** (payment-intents).
> Para cobro por QR, ver [`api-orders-qr.md`](./api-orders-qr.md). Para la nueva Orders API de Point (futura migración), ver [`api-orders-point.md`](./api-orders-point.md).

---

## Base URL

```
https://api.mercadopago.com/point/integration-api
```

- `Authorization: Bearer <ACCESS_TOKEN>` — token del vendedor (Bosko), resuelto dinámicamente por `barId`/`deviceId`
- `X-Device-Id` — header que envía el frontend indicando qué terminal usar

---

## Endpoints del módulo

### Listar devices vinculados

**`GET /point/integration-api/devices`**

```
Authorization: Bearer <ACCESS_TOKEN>
```

Response:
```json
{
  "devices": [
    {
      "id": "PAX_A910__SMARTPOS1234567890",
      "pos_id": 2711382,
      "store_id": 1234567,
      "operating_mode": "PDV"
    }
  ]
}
```

> Usar para sincronizar devices desde MP a la tabla `mercadopago_cajas_devices`.

---

### Crear intención de cobro

**`POST /point/integration-api/devices/{deviceId}/payment-intents`**

```json
{
  "amount": 1500,
  "description": "Mesa 3 — Cocktrail",
  "payment": {
    "installments": 1,
    "installments_cost": "seller"
  }
}
```

Response:
```json
{
  "id": "pay-intent-abc123",
  "device_id": "PAX_A910__SMARTPOS1234567890",
  "amount": 1500,
  "state": "OPEN"
}
```

---

### Consultar estado de la intención (polling)

**`GET /point/integration-api/devices/{deviceId}/payment-intents/events`**

Response:
```json
{
  "id": "pay-intent-abc123",
  "state": "FINISHED",
  "payment": { "id": 987654321 }
}
```

### Estados posibles y qué hacer en cada uno

| Estado crudo MP | Estado normalizado (Cocktrail) | Acción |
|----------------|-------------------------------|--------|
| `OPEN` | `OPEN` | Seguir polling |
| `ON_TERMINAL` | `ON_TERMINAL` | Seguir polling (el cliente está pagando) |
| `FINISHED` | `FINISHED` | Concretar pedido ✅ |
| `CANCELED` | `CANCELED` | Volver al selector de método ❌ |
| `CONFIRMATION_REQUIRED` | `FINISHED` o `CANCELED` o `PENDING` | **Ver sección abajo** ⚠️ |

#### Manejo de `CONFIRMATION_REQUIRED`

MP no pudo confirmar si el cobro se realizó. El response incluye `payment.id`.

1. Llamar `GET /v1/payments/{payment.id}` (ver [`api-payments.md`](./api-payments.md))
2. Mapear según el `status` del pago:
   - `approved` → normalizar como `FINISHED` → concretar pedido
   - `rejected` | `cancelled` → normalizar como `CANCELED` → abortar
   - `pending` | `in_process` | cualquier otro → normalizar como `PENDING` → reintentar polling

---

### Cancelar intención de cobro

**`DELETE /point/integration-api/devices/{deviceId}/payment-intents/{paymentIntentId}`**

Response: `200 OK` si se canceló correctamente.

> Llamar cuando se cancela desde el frontend o al hacer cleanup de una sesión anterior.

---

### Verificar conexión del device

**`GET /point/integration-api/devices/{deviceId}`**

Response:
```json
{
  "id": "PAX_A910__SMARTPOS1234567890",
  "operating_mode": "PDV",
  "status": { "state": "ACTIVE" }
}
```

---

## Notas de implementación

- El `deviceId` viene del header `X-Device-Id` que envía el frontend (guardado en `localStorage` por el cajero al seleccionar terminal)
- La función `getDynamicCredentials({ deviceId })` resuelve el `access_token` del vendedor dueño de ese device
- Modelo: **1 terminal Point por caja/POS** — si hay 5 posnets, hay 5 POS registrados en MP
- La Point API **no soporta QR** en el dispositivo — el QR es un producto distinto (Orders API `type:"qr"` con `external_pos_id`)
- **Migración pendiente**: este sistema de payment-intents será reemplazado por la Orders API (`type:"point"`) → ver [`api-orders-point.md`](./api-orders-point.md)
