# API — Consulta de Pagos (Payments API)

> **Cuándo leer esto**: únicamente cuando recibís `CONFIRMATION_REQUIRED` desde la Point API y necesitás resolver el estado real del cobro consultando el pago por su ID.
> Para el flujo normal de cobro Posnet, ver [`api-point-devices.md`](./api-point-devices.md).

---

## Endpoint

**`GET https://api.mercadopago.com/v1/payments/{payment_id}`**

```
Authorization: Bearer <ACCESS_TOKEN_DEL_VENDEDOR>
```

El `payment_id` viene del campo `payment.id` en la respuesta de `CONFIRMATION_REQUIRED` del polling de Point.

---

## Response relevante

```json
{
  "id": 987654321,
  "status": "approved",
  "status_detail": "accredited",
  "transaction_amount": 1500.00,
  "currency_id": "ARS",
  "payment_method_id": "debvisa",
  "date_approved": "2026-07-15T22:14:00.000Z"
}
```

---

## Mapeo de `status` → estado normalizado Cocktrail

| `status` del pago | Estado normalizado | Acción en `/caja` |
|-------------------|-------------------|-------------------|
| `approved` | `FINISHED` | Concretar pedido ✅ |
| `rejected` | `CANCELED` | Volver al selector ❌ |
| `cancelled` | `CANCELED` | Volver al selector ❌ |
| `pending` | `PENDING` | Reintentar polling ⏳ |
| `in_process` | `PENDING` | Reintentar polling ⏳ |
| cualquier otro | `PENDING` | Reintentar polling ⏳ |

---

## Notas

- Este endpoint usa el mismo `access_token` del vendedor que el resto del módulo MP — **no** requiere credenciales adicionales
- No se necesita `MP_POS_DEVICE_ID` para esta llamada — es una consulta de pagos estándar
- El método en el service es `getPayment(paymentId: string, deviceId?: string)` — el `deviceId` opcional se usa para resolver las credenciales dinámicas del vendedor
