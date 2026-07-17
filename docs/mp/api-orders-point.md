# API — Orders Point (Cobro con Terminal Física)

> **Cuándo leer esto**: cuando necesitás crear/cancelar/consultar una order de cobro en un Posnet/terminal Point física.
> Esta es la **nueva API unificada** (`type: "point"`) que reemplaza al sistema legacy de payment-intents.
> Para cobro por QR, ver [`api-orders-qr.md`](./api-orders-qr.md).

---

## Cómo funciona en Cocktrail

```
Cajero selecciona "Tarjeta" en /caja
  → Frontend obtiene terminal_id del device seleccionado (localStorage "activePosnetId")
  → Backend crea order via POST /v1/orders (type: "point", terminal_id: "PAX_A910__...")
  → La order aparece automáticamente en la pantalla del Posnet
  → Cliente pasa la tarjeta → paga
  → Cocktrail recibe notificación webhook → concreta el pedido
```

---

## Paso 0 — Obtener el terminal_id disponible

**`GET https://api.mercadopago.com/terminals/v1/list`**

```
Authorization: Bearer <ACCESS_TOKEN>
Query params: store_id=12354567&pos_id=23545678  (opcionales, para filtrar)
```

Response:
```json
{
  "data": {
    "terminals": [
      {
        "id": "PAX_A910__SMARTPOS1234567890",
        "pos_id": "23545678",
        "store_id": "12354567",
        "external_pos_id": "COCKTRAIL-BAR-01",
        "operating_mode": "PDV"
      }
    ]
  }
}
```

> El `id` del terminal debe estar en `operating_mode: "PDV"` para recibir orders.
> Se guarda en `mercadopago_cajas_devices.device_id`.

---

## Crear una order Point

**`POST https://api.mercadopago.com/v1/orders`**

Headers:
```
Authorization: Bearer <ACCESS_TOKEN_DEL_VENDEDOR>
X-Idempotency-Key: <UUID_UNICO>
```

### Body

```json
{
  "type": "point",
  "external_reference": "COCKTRAIL-ORDER-1721234567",
  "expiration_time": "PT15M",
  "description": "Barra Principal — Mesa 3",
  "transactions": {
    "payments": [
      { "amount": "1500.00" }
    ]
  },
  "config": {
    "point": {
      "terminal_id": "PAX_A910__SMARTPOS1234567890",
      "print_on_terminal": "no_ticket"
    },
    "payment_method": {
      "default_type": "credit_card"
    }
  }
}
```

### Parámetros clave

| Parámetro | Obligatorio | Notas |
|-----------|-------------|-------|
| `type` | ✅ | Siempre `"point"` para Posnet |
| `external_reference` | ✅ | ID único de Cocktrail — guardar en DB |
| `config.point.terminal_id` | ✅ | ID exacto del Posnet (del endpoint de terminales) |
| `transactions.payments[].amount` | ✅ | Con 2 decimales obligatorios: `"1500.00"` |
| `expiration_time` | — | Default 15 min. Si expira sin pago → `status: expired` |
| `X-Idempotency-Key` | ✅ | UUID nuevo por intento |

### Response

```json
{
  "id": "ORD00001111222233334444555566",
  "type": "point",
  "status": "created",
  "external_reference": "COCKTRAIL-ORDER-1721234567",
  "config": {
    "point": {
      "terminal_id": "PAX_A910__SMARTPOS1234567890"
    }
  },
  "transactions": {
    "payments": [
      {
        "id": "PAY01J67CQQH5904WDBVZEM4JMEP3",
        "amount": "1500.00",
        "status": "created"
      }
    ]
  }
}
```

> ⚠️ Guardar `id` (order) y `transactions.payments[0].id` (pago).
> La order aparece automáticamente en el Posnet. Si no carga sola, presionar **Actualizar** o el **botón verde**.

---

## Cancelar una order Point

| Condición | Cómo cancelar |
|-----------|---------------|
| `status = "created"` | Via API: `POST /v1/orders/{order_id}/cancel` |
| `status = "at_terminal"` | Desde la terminal: presionar botón inferior derecho → "Sí, salir" |
| `status = "expired"` | No cancelable (expiró por timeout) |

```bash
curl -X POST 'https://api.mercadopago.com/v1/orders/ORDER_ID/cancel' \
  -H 'Authorization: Bearer ACCESS_TOKEN' \
  -H 'X-Idempotency-Key: UUID'
```

---

## Consultar una order Point

**`GET https://api.mercadopago.com/v1/orders/{order_id}`**

> Solo órdenes con menos de 3 meses. Para orders más viejas → soporte de MP.

---

## Reembolso de una order Point

**`POST https://api.mercadopago.com/v1/orders/{order_id}/refund`**

- **Total**: sin body — plazo máximo **90 días**
- **Parcial**: body con `transactions[].id` y `amount`
- Algunos reembolsos requieren insertar la tarjeta en el dispositivo físico

---

## Estados de la order

| Status | Significado |
|--------|-------------|
| `created` | Enviada, esperando que el Posnet la obtenga |
| `at_terminal` | El Posnet ya la recibió — cancelar desde el device |
| `processed` | Pago exitoso ✅ |
| `canceled` | Cancelada |
| `expired` | Expiró sin ser procesada |
| `refunded` | Reembolsada |

---

## Diferencia con el sistema legacy (payment-intents)

El código actual de Cocktrail usa el sistema legacy de `payment-intents` (`POST /point/integration-api/devices/{deviceId}/payment-intents`). La nueva Orders API (`type: "point"`) es más moderna y unificada. La migración está anotada como deuda técnica.
