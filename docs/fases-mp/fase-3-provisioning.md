# Plan MP — Fase 3: Provisionamiento

> **Docs relevantes**: [`docs/mp/api-stores-pos.md`](../mp/api-stores-pos.md), [`docs/mp/api-point-devices.md`](../mp/api-point-devices.md)


### A) ¿Qué se hace?

Backend: crear endpoints para gestionar la Store (sucursal), cajas/POS con QR estático, y vinculación de terminals Point/Posnet. Frontend: un panel "PDV" en `/admin?tab=pdv` que muestra el estado de la sucursal y permite administrar cajas y Posnets con un grid CRUD siguiendo el patrón de `CartaSection`.

### B) ¿Por qué?

Es el Paso 2 del onboarding definido en [`docs/specs/mercadopago/integracion-mp.md`](../specs/mercadopago/integracion-mp.md) § "Provisionamiento". Sin Store y POS no existe la caja en MP, y sin la caja no hay `external_pos_id` → no se puede crear una order QR después. El `location` de la Store es obligatorio y afecta cálculos fiscales (ver [`docs/mp/api-stores-pos.md`](../mp/api-stores-pos.md) § "Crear Sucursal"). El QR que devuelve MP al crear el POS es **estático e inmutable** — se guarda una vez y se imprime en la barra.

**Modelo operativo**: Cocktrail tiene 1 sola barra (`BARRA-01`/"Barra VIP"). La sucursal se crea automáticamente al onboardear (Fase 1). La UI de PDV muestra solo esta barra y su Posnet vinculado. El botón "+ Nueva barra" existe pero muestra una advertencia de que la funcionalidad multi-barra no está disponible todavía (está mapeado al `BAR_CODE` actual, no es dinámico).

### C) Backend — Endpoints de Provisionamiento

**Docs**: [`docs/mp/api-stores-pos.md`](../mp/api-stores-pos.md)

**C.1) Store (sucursal) — se crea automáticamente, no desde la UI**

La sucursal es Bosko — el comercio dueño del dinero vinculado vía OAuth. Se crea **una sola vez** como parte del onboarding. La UI solo muestra su estado.

```
POST /api/mercadopago/provisioning/store
  BODY: { barId, name, address }
  → POST /users/{seller.user_id}/stores (MP)
  → guarda store_id en mercadopago_cajas
```

**C.2) POS (caja) — CRUD completo desde la UI**

```
GET    /api/mercadopago/provisioning/cajas
  → lista todas las cajas del seller desde mercadopago_cajas
  → devuelve: [{ id, barId, posIdMp, externalPosId, qrImage, device? }]

POST   /api/mercadopago/provisioning/pos
  BODY: { barId, name }
  → credentialsResolver.resolve({ allowGlobalFallback: true })
  → POST /pos (MP) con fixed_amount=true, store_id, external_store_id, external_id
  → guarda en mercadopago_cajas (pos_id_mp, qr_image, qr_template, external_pos_id, seller_user_id)

DELETE /api/mercadopago/provisioning/pos/:id
  → elimina de mercadopago_cajas (cascada: devices huérfanos se limpian)
  → NOTA: no se cancela en MP (el POS queda; MP no tiene endpoint DELETE /pos)
```

**C.3) Device (Posnet) — vincular/desvincular**

```
POST   /api/mercadopago/provisioning/device
  BODY: { cajaId, deviceId, deviceUsername }
  → verifica que el device existe en MP (GET /point/integration-api/devices/{id})
  → inserta en mercadopago_cajas_devices (UNIQUE caja_id + UNIQUE device_id)

DELETE /api/mercadopago/provisioning/device/:id
  → elimina de mercadopago_cajas_devices

GET    /api/mercadopago/provisioning/devices
  → lista todos los devices vinculados con su caja
```

### D) Frontend — Consolidado en `PagosSection`

Todo el panel MP vive en una sola sección dentro de `/admin?tab=pagos`. El componente `PagosSection.tsx` concentra:

1. **Vinculación OAuth** — botón Vincular/Re-vincular + estado de cuenta + toggle Sandbox
2. **Puntos de Venta** — grid colapsado centrado en BARRA VIP con QR y Posnet vinculado
3. **Posnets** — gestión de terminals Point (agregar por ID + alias, test $15)

```
┌─ PagosSection.tsx ──────────────────────────────────────────────┐
│                                                                   │
│  ┌─ Card 1: Vinculación + Sandbox ──────────────────────────┐   │
│  │  [Mercado Pago]                    [Sandbox ○──●]         │   │
│  │  ┌─ Cuenta ──────────────────────────────────────────┐   │   │
│  │  │  👤 Bosko Bar  ✉ bosko@test.com  📅 hace 2d      │   │   │
│  │  └───────────────────────────────────────────────────┘   │   │
│  │  [────── Vincular ──────]                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Card 2: Puntos de Venta (grid colapsado) ───────────────┐   │
│  │                                                            │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │  🏪 BARRA VIP                       Activa         │   │   │
│  │  │  COCKTRAIL-BAR-01                                  │   │   │
│  │  │                                                    │   │   │
│  │  │  [📋 QR]  → abre QR estático del PDV               │   │   │
│  │  │  [🖥️ Posnet: Caja 1 ▾]  → dropdown de Posnets    │   │   │
│  │  │                          para vincular al PDV       │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Card 3: Posnets ────────────────────────────────────────┐   │
│  │                                                            │   │
│  │  Agregar Posnet                                           │   │
│  │  [Device ID______________] [Alias________] [+ Agregar]    │   │
│  │                                                            │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │  🖥️ PAX_A910__SMARTDEBUG0001                      │   │   │
│  │  │  Alias: Caja 1                [Test $15] [✕ Eliminar]│   │   │
│  │  ├────────────────────────────────────────────────────┤   │   │
│  │  │  🖥️ PAX_A910__TERMINAL02                           │   │   │
│  │  │  Alias: Barra VIP              [Test $15] [✕ Eliminar]│   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Flujo de vinculación de Posnet a PDV**:
1. En Card 3 (Posnets), el admin agrega un Posnet con `deviceId` + `alias`
2. En Card 2 (Puntos de Venta), el botón `🖥 Posnet: [▾]` abre un dropdown con todos los Posnets registrados
3. El admin elige uno → se vincula al PDV (el alias del Posnet aparece junto al icono)
4. Si ya hay un Posnet vinculado, elegir otro lo reemplaza

**Flujo de Test $15**:
1. En Card 3, cada Posnet tiene un botón `[Test $15]`
2. Llama a `POST /api/mercadopago/device/test-charge` (ya implementado en Fase 5)
3. El backend crea una intención de $15 y espera a que el Posnet la reciba
4. Resultado: "Recibido" ✅ o "Sin respuesta" ❌

**Cambios respecto al diseño anterior**:
- ❌ Sin tab "PDV" separado en sidebar — todo en Pagos
- ❌ Sin sección de "Credenciales" — solo OAuth
- ❌ Sin Card 4 "Método de cobro"
- ✅ Puntos de Venta colapsado en un solo grid con BARRA VIP como protagonista
- ✅ Posnets gestionable: agregar por ID + alias, test $15, eliminar
- ✅ Vinculación Posnet↔PDV vía dropdown desde Puntos de Venta
