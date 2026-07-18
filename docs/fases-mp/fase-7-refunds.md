# Plan MP — Fase 7: Reembolsos

> **Docs relevantes**: [`docs/mp/api-orders-qr.md`](../mp/api-orders-qr.md)


### A) ¿Qué se hace?

Permitir reembolso total o parcial de una order (QR o Point) desde el panel de admin.

### B) ¿Por qué?

Cubre el caso de negocio donde un pedido ya fue pagado pero necesita devolverse (error en el monto, producto no disponible, etc.). La Orders API de MP soporta reembolso total (sin body) y parcial (con `transactions[].id` y `amount`). Los plazos difieren: QR tiene 180 días, Point tiene 90 días.

**Docs**: [`docs/mp/api-orders-qr.md`](../mp/api-orders-qr.md) § "Reembolso de una order QR"

### C) Implementación

**`POST /api/mercadopago/orders/{orderId}/refund`**

```
SERVICE: refundOrder(orderId, opts)
  token = getAccessTokenForContext({ barId: opts.barId })

  IF opts.amount IS NULL
    // Reembolso TOTAL — sin body
    response = POST https://api.mercadopago.com/v1/orders/{orderId}/refund
      Authorization: Bearer {token}
      X-Idempotency-Key: {randomUUID()}
  ELSE
    // Reembolso PARCIAL
    response = POST https://api.mercadopago.com/v1/orders/{orderId}/refund
      Authorization: Bearer {token}
      X-Idempotency-Key: {randomUUID()}
      BODY: { transactions: [{ id: paymentId, amount: opts.amount }] }

  mpOrdersRepo.updateStatus(orderId, response.status)
  RETURN response
```

**Plazos máximos**:
- QR order: 180 días desde el pago
- Point order: 90 días desde el pago

---

