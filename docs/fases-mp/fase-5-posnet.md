# Plan MP — Fase 5: Posnet

> **Docs relevantes**: [`docs/mp/api-point-devices.md`](../mp/api-point-devices.md), [`docs/mp/api-payments.md`](../mp/api-payments.md)

### A) ¿Qué se hace?

Gestión de terminals Point/Posnet desde la sección **Posnets** en `PagosSection.tsx`. El backend de payment-intents legacy (ya implementado) se mantiene sin cambios funcionales. Se agrega la UI para registrar Posnets por `deviceId` + `alias`, vincularlos a un PDV desde Puntos de Venta, y probar conectividad con un test de $15.

### B) ¿Por qué?

El spec [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Decisiones tomadas" indica explícitamente: la Point API es un producto distinto para terminales físicas. La migración a Orders API `type: "point"` es deuda técnica futura. Los endpoints legacy (`POST /pos/intent`, `GET /device/status`, etc.) ya están implementados y funcionando — solo se refactorizaron para usar `CredentialsResolverService` (Fase 2).

Esta fase agrega la **gestión administrativa** de los Posnets sin tocar el flujo de cobro: registrar terminals con alias, vincularlas a PDVs, y verificar conectividad.

### C) Backend — Sin cambios funcionales

Los 5 endpoints legacy siguen igual. Ya refactorizados en Fase 2 para usar `credentialsResolver`:

```
POST   /api/mercadopago/pos/intent          → [IMPLEMENTADO]
GET    /api/mercadopago/pos/intent/:id      → [IMPLEMENTADO]
DELETE /api/mercadopago/pos/intent/:id      → [IMPLEMENTADO]
GET    /api/mercadopago/device/status        → [IMPLEMENTADO]
POST   /api/mercadopago/device/test-charge   → [IMPLEMENTADO]
```

### D) Gestión de Posnets (provisioning, Fase 3)

Endpoints ya implementados en Fase 3 para CRUD de devices:

```
GET    /api/mercadopago/provisioning/devices      → lista Posnets registrados
POST   /api/mercadopago/provisioning/device        → registra Posnet (deviceId + alias)
DELETE /api/mercadopago/provisioning/device/:id    → elimina registro
```

### E) Frontend — Posnets en `PagosSection`

**Card 3 — Posnets**: sección de gestión con tres funcionalidades:

#### E.1) Agregar Posnet

Formulario inline con dos campos y un botón:

```
[Device ID: PAX_A910__...] [Alias: Caja 1] [+ Agregar]
```

- `deviceId`: ID de la terminal Point (ej. `PAX_A910__SMARTPOS1234567890`)
- `alias`: nombre descriptivo para identificar el Posnet en el dropdown de vinculación
- Al agregar, el backend verifica que el device existe en MP (`GET /point/integration-api/devices/{id}`) antes de guardar

#### E.2) Lista de Posnets

Grid mostrando cada Posnet registrado con:

```
┌────────────────────────────────────────────────────────────────┐
│  🖥️ PAX_A910__SMARTDEBUG0001                                   │
│  Alias: Caja 1                    [Test $15] [✕ Eliminar]      │
├────────────────────────────────────────────────────────────────┤
│  🖥️ PAX_A910__TERMINAL02                                        │
│  Alias: Barra VIP                 [Test $15] [✕ Eliminar]      │
└────────────────────────────────────────────────────────────────┘
```

#### E.3) Test $15

Botón `[Test $15]` en cada Posnet. Llama a `POST /api/mercadopago/device/test-charge` (ya implementado en el backend). Flujo:

1. Admin clickea `[Test $15]`
2. Backend crea intención de cobro de $15 en ese device
3. Polling ~15s esperando que el Posnet reciba la intención
4. Resultado:
   - ✅ "Recibido — el Posnet respondió. Cancelá la operación en el dispositivo."
   - ❌ "Sin respuesta — el Posnet no respondió en 15 segundos."

#### E.4) Eliminar Posnet

Botón `[✕ Eliminar]` — elimina el registro de `mercadopago_cajas_devices`. Si el Posnet estaba vinculado a un PDV, la vinculación se pierde (el PDV queda sin Posnet).

### F) Vinculación Posnet ↔ PDV (desde Puntos de Venta)

En la Card 2 (Puntos de Venta), cada PDV tiene un botón `🖥 Posnet: [alias ▾]` que abre un dropdown con todos los Posnets registrados:

```
🖥 Posnet: Caja 1 ▾
     ├─ Caja 1 (PAX_A910__SMARTDEBUG0001)  ← seleccionado
     ├─ Barra VIP (PAX_A910__TERMINAL02)
     └─ Sin Posnet
```

Al seleccionar uno:
1. Se llama a `POST /api/mercadopago/provisioning/device` con `{ cajaId, deviceId }`
2. El PDV queda vinculado al Posnet elegido
3. El alias del Posnet se muestra junto al icono 🖥️ en el PDV

Si el PDV ya tenía un Posnet vinculado, elegir otro lo reemplaza (el viejo se desvincula automáticamente por `UNIQUE(caja_id)`).

### Docs relevantes
- Sistema actual: [`docs/mp/api-point-devices.md`](../mp/api-point-devices.md)
- Resolución de `CONFIRMATION_REQUIRED`: [`docs/mp/api-payments.md`](../mp/api-payments.md)
- Migración futura a Orders API: [`docs/mp/api-orders-point.md`](../mp/api-orders-point.md)
