# API — Orders QR (Modelo Estático)

> **Cuándo leer esto**: cuando necesitás crear/cancelar/consultar una order de pago por QR en Cocktrail.
> El modelo elegido para Cocktrail es **estático**: cada PDV/barra tiene su QR fijo impreso, y cuando el cajero genera el cobro, ese QR se "carga" con el monto automáticamente.
> Para la API de Orders de Point (cobro en Posnet), ver [`api-orders-point.md`](./api-orders-point.md).

---

## Modelo estático — cómo funciona en Cocktrail

```
Cajero genera cobro en /caja
  → Backend crea order via POST /v1/orders (type: "qr", mode: "static", external_pos_id: "COCKTRAIL-BAR-01")
  → El QR fijo de esa barra (impreso/pegado) queda "cargado" con el monto
  → Cliente escanea ese QR con la app de MP → paga
  → Cocktrail recibe notificación webhook → concreta el pedido
```

**Requisito previo**: la caja debe existir en MP con el mismo `external_id` que se usa como `external_pos_id` aquí. Ver [`api-stores-pos.md`](./api-stores-pos.md).

---

## Crear una order QR

**`POST https://api.mercadopago.com/v1/orders`**

Headers:
```
Authorization: Bearer <ACCESS_TOKEN_DEL_VENDEDOR>
X-Idempotency-Key: <UUID_UNICO_POR_INTENTO>
```

### Body (modelo estático para Cocktrail)

```json
{
  "type": "qr",
  "external_reference": "COCKTRAIL-ORDER-1721234567",
  "total_amount": "1500.00",
  "description": "Barra Principal — Mesa 3",
  "expiration_time": "PT15M",
  "config": {
    "qr": {
      "external_pos_id": "COCKTRAIL-BAR-01",
      "mode": "static"
    }
  },
  "transactions": {
    "payments": [
      { "amount": "1500.00" }
    ]
  },
  "items": [
    {
      "title": "Consumo Barra Principal",
      "unit_price": "1500.00",
      "quantity": 1,
      "unit_measure": "unit"
    }
  ]
}
```

### Parámetros clave

| Parámetro | Obligatorio | Notas |
|-----------|-------------|-------|
| `type` | ✅ | Siempre `"qr"` para pagos QR |
| `external_reference` | ✅ | ID único de Cocktrail para esta order — guardar en DB |
| `config.qr.external_pos_id` | ✅ | Debe coincidir con el `external_id` de la caja en MP |
| `config.qr.mode` | — | Default `"static"` si no se envía |
| `X-Idempotency-Key` | ✅ | UUID nuevo por cada intento — evita duplicar pagos |
| `expiration_time` | — | Formato ISO 8601 duration. Default: 15 min. Rango: 30s a 3600h |

### Response (modelo estático)

```json
{
  "id": "ORD01K371WBFDS4MD9JG0K8ZMECBE",
  "status": "created",
  "external_reference": "COCKTRAIL-ORDER-1721234567",
  "transactions": {
    "payments": [
      {
        "id": "PAY01K371WBFDS4MD9JG0KCV6PRKQ",
        "amount": "1500.00",
        "status": "created",
        "status_detail": "ready_to_process"
      }
    ]
  },
  "config": {
    "qr": {
      "external_pos_id": "COCKTRAIL-BAR-01",
      "mode": "static"
    }
  }
}
```

> ⚠️ Guardar `id` (order) y `transactions.payments[0].id` (pago) — necesarios para consultas y webhooks.

---

## Cancelar una order QR

Solo cancelable cuando `status = "created"`.

**`POST https://api.mercadopago.com/v1/orders/{order_id}/cancel`**
```
Authorization: Bearer <ACCESS_TOKEN>
X-Idempotency-Key: <UUID>
```

Response: `status = "canceled"`.

---

## Consultar una order QR

**`GET https://api.mercadopago.com/v1/orders/{order_id}`**

> Solo disponible para orders con menos de 3 meses de antigüedad.

---

## Reembolso de una order QR

**`POST https://api.mercadopago.com/v1/orders/{order_id}/refund`**

- **Total**: sin body
- **Parcial**: body `{ "transactions": [{ "id": "PAY...", "amount": "500.00" }] }`
- Plazo máximo: **180 días** tras el pago

---

## Estados de la order y del pago

| Status order | Significado |
|-------------|-------------|
| `created` | Esperando que el cliente escanee y pague |
| `processed` | Pago completado ✅ |
| `canceled` | Cancelada (por API o expiración) |
| `refunded` | Reembolsada |

---

## Errores comunes

| Status | Error | Causa |
|--------|-------|-------|
| 400 | `pos_not_found` | El `external_pos_id` no existe en MP |
| 400 | `empty_required_header` | Falta `X-Idempotency-Key` |
| 409 | `idempotency_key_already_used` | La key ya fue usada en las últimas 24h — generar nueva |
| 401 | `unauthorized` | Token inválido o expirado |
