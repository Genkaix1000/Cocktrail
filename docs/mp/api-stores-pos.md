# API — Sucursales y Cajas (Stores & POS)

> **Cuándo leer esto**: cuando necesitás crear o consultar una sucursal (`Store`) o caja (`POS`) en la cuenta MP de un vendedor.
> Para el flujo OAuth previo, ver [`api-oauth.md`](./api-oauth.md).

---

## Conceptos

| Término MP | Qué es en Cocktrail |
|------------|---------------------|
| `Store` / Sucursal | El local físico ("Bosko Bar"). Se crea 1 por comercio. |
| `POS` / Caja | Un punto de venta dentro del local. Se crea 1 por barra. |
| `external_id` (store) | ID que Cocktrail asigna a la sucursal (ej. `"COCKTRAILSUC001"`) — **solo alfanumérico** |
| `external_id` (pos) | ID que Cocktrail asigna a la caja (ej. `"COCKTRAILBAR01"`) — **solo alfanumérico** (MP rechaza guiones) |
| `store_id` | ID numérico que **MP asigna** a la sucursal — se obtiene del response y se guarda en DB |

---

## Crear Sucursal

**`POST /users/{user_id}/stores`**
- `Authorization: Bearer <ACCESS_TOKEN_DEL_VENDEDOR>` (token OAuth de Bosko, no de Cocktrail)
- `user_id` = `mp_user_id` del vendedor (obtenido tras OAuth)

### Body mínimo

```json
{
  "name": "Bosko Bar",
  "external_id": "COCKTRAILSUC001",
  "location": {
    "street_number": "739",
    "street_name": "Ramon Castillo",
    "city_name": "Bolívar",
    "state_name": "Buenos Aires",
    "latitude": -36.23,
    "longitude": -61.11,
    "reference": "Frente a la rotonda"
  }
}
```

> ⚠️ `location` es obligatorio y debe tener datos reales — afecta cálculos fiscales y visibilidad en el mapa de MP.

### Response relevante

```json
{
  "id": 1234567,
  "name": "Bosko Bar",
  "external_id": "COCKTRAILSUC001",
  "location": { "address_line": "Ramon Castillo 739, Buenos Aires." }
}
```

**Guardar en DB**: `id` → campo `store_id` en `mercadopago_cajas` o tabla de sucursales.

### Errores comunes

| Status | Error | Causa |
|--------|-------|-------|
| 400 | `INVALID_LOCATION` | `location` mal formateado |
| 400 | `INVALID_NAME` | `name` con caracteres especiales |
| 403 | `Forbidden` | `user_id` no coincide con el token usado |

---

## Crear Caja (POS)

**`POST /pos`**
- `Authorization: Bearer <ACCESS_TOKEN_DEL_VENDEDOR>`

### Body

```json
{
  "name": "Barra Principal",
  "fixed_amount": true,
  "store_id": 1234567,
  "external_store_id": "COCKTRAILSUC001",
  "external_id": "COCKTRAILBAR01"
}
```

> `fixed_amount: true` es **obligatorio** para integraciones programadas (el vendedor controla el monto, no el cliente).

### Response relevante

```json
{
  "id": 2711382,
  "external_id": "COCKTRAILBAR01",
  "store_id": 1234567,
  "status": "active",
  "qr": {
    "image": "https://www.mercadopago.com/instore/merchant/qr/2711382/...png",
    "template_document": "https://...pdf",
    "template_image": "https://...png"
  }
}
```

**Guardar en DB**: `id` (pos_id de MP), `qr.image`, `qr.template_document` en `mercadopago_cajas`.

---

## Notas de implementación para Cocktrail

1. Crear primero la sucursal → obtener `store_id` → crear las cajas con ese `store_id`
2. Guardar `external_id` propio en cada entidad para poder referenciarla sin depender solo del ID de MP
3. El QR del response de POS es **estático** — no cambia. Se puede cachear/guardar permanentemente
4. Para Point (posnet): la asociación terminal ↔ caja se hace vía la Point API por separado (ver [`api-point-devices.md`](./api-point-devices.md))
