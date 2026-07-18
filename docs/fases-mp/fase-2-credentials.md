# Plan MP — Fase 2: Resolución de Credenciales

> **Docs relevantes**: [`docs/mp/INDEX.md`](../mp/INDEX.md), [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md)


### A) ¿Qué se hace?

Crear un servicio `CredentialsResolverService` que obtenga un `access_token` válido del único vendedor vinculado (single-seller), refrescándolo proactivamente si está por vencer. El `MercadoPagoService` existente (Posnet) se refactoriza para usar este resolver en vez de `env.MP_ACCESS_TOKEN` directo.

### B) ¿Por qué?

El modelo operativo de Cocktrail es **single-seller**: un solo comercio (Bosko) recibe todo el dinero, independientemente de cuántas barras o cajeras operen. No hay multi-seller. Hoy el código usa `env.MP_ACCESS_TOKEN` hardcodeado — con OAuth (Fase 1), el token vive en `mercadopago_sellers` (Cloud) y debe refrescarse proactivamente. El resolver abstrae esa complejidad para que el resto del módulo MP (Posnet, futuro QR) solo pida `credentialsResolver.resolve()` y reciba un token listo.

**Cloud vs Local**: `mercadopago_sellers` vive en Cloud (escrito por el callback OAuth). El resolver usa `mpDb` (cloud-first, ver `shared/supabase.ts`). Si Cloud no está disponible, `mpDb` cae a `supabase` local y, si tampoco hay sellers ahí, al fallback `env.MP_ACCESS_TOKEN` (legacy, solo si `allowGlobalFallback=true`).

### C) Implementación

**C.1) `CredentialsResolverService`**

**Archivo**: `apps/api/src/modules/mercadopago/credentials-resolver.service.ts`

```ts
import { env } from "../../config/env.js";
import type { MercadoPagoSellersRepository, Seller } from "../mercadopago-sellers.repository.js";
import type { MercadoPagoOAuthService } from "../mercadopago-oauth.service.js";

export type CredentialContext = {
  sellerUserId?: string;
  allowGlobalFallback?: boolean;
};

export class CredentialsResolverService {
  constructor(
    private readonly sellersRepo: MercadoPagoSellersRepository,
    private readonly oauthService: MercadoPagoOAuthService,
  ) {}

  async resolve(context: CredentialContext = {}): Promise<string> {
    let seller: Seller | null = null;

    // 1. sellerUserId explícito (admin/provisioning — prioridad máxima)
    if (context.sellerUserId) {
      seller = await this.sellersRepo.findByUserId(context.sellerUserId);
    }

    // 2. Seller activo por defecto (único vendedor vinculado vía OAuth)
    if (!seller) {
      seller = await this.sellersRepo.findFirstActive();
    }

    // 3. Fallback legacy env vars — solo si allowGlobalFallback
    if (!seller) {
      if (context.allowGlobalFallback && env.MP_ACCESS_TOKEN) {
        return env.MP_ACCESS_TOKEN;
      }
      throw new Error(
        "No hay ninguna cuenta de Mercado Pago vinculada. " +
        "Vinculala desde /admin?tab=pagos."
      );
    }

    // Validar que el seller esté activo antes de refrescar
    if (seller.status !== "active") {
      throw new Error(
        `La cuenta de Mercado Pago (${seller.userId}) está desconectada. ` +
        "Volvé a vincularla desde /admin?tab=pagos."
      );
    }

    // Validar que tenga refresh_token para refrescar proactivamente
    if (!seller.refreshToken) {
      throw new Error(
        `La cuenta de Mercado Pago (${seller.userId}) no tiene refresh_token. ` +
        "Volvé a vincularla para obtener uno nuevo."
      );
    }

    // Refrescar si está por vencer (Fase 1 — C.3).
    // ⚠ Concurrencia: refreshTokenIfNeeded debe usar lock por seller
    // (advisory lock o row lock) porque el refresh_token es de un solo uso.
    return this.oauthService.refreshTokenIfNeeded(seller);
  }
}
```

**Wiring en `app.ts`**:

```ts
const credentialsResolver = new CredentialsResolverService(mpSellersRepo, mpOAuthService);
```

**C.2) Refactor de `MercadoPagoService` (Posnet legacy)**

El servicio Posnet debe migrar de `env.MP_ACCESS_TOKEN` al resolver. Cambios puntuales:

| Qué cambia | Cómo |
|---|---|
| Constructor | Recibe `CredentialsResolverService` como dependencia |
| `assertConfigured(requireDevice)` | Deja de leer `env.MP_ACCESS_TOKEN`. Solo valida `env.MP_POS_DEVICE_ID` si `requireDevice=true` |
| `pointApiRequest(token, path, init, errorMsg)` | Cambia firma: recibe `token: string` como primer parámetro. Header `Authorization: Bearer {token}` en vez de `Bearer ${env.MP_ACCESS_TOKEN}` |
| `checkDeviceConnection()` | Llama a `credentialsResolver.resolve({ allowGlobalFallback: true })` antes de hacer el fetch. Usa el token resuelto en `Authorization` |
| `createPaymentIntent(amount, desc)` | Llama a `credentialsResolver.resolve({ allowGlobalFallback: true })` antes de `pointApiRequest` |
| `getPaymentIntentStatus(id)` | Ídem |
| `cancelPaymentIntent(id)` | Ídem |
| `testDeviceReachability()` | Ídem |

Ejemplo del cambio en `createPaymentIntent`:

```ts
// Antes:
async createPaymentIntent(amount: number, description?: string) {
  this.assertConfigured();
  const response = await this.pointApiRequest<MpPaymentIntentResponse>(
    `/point/integration-api/devices/${env.MP_POS_DEVICE_ID}/payment-intents`,
    { method: "POST", body: JSON.stringify({ amount, ... }) },
    "Error al crear intención de cobro"
  );
}

// Después:
async createPaymentIntent(amount: number, description?: string) {
  this.assertConfigured();
  const token = await this.credentialsResolver.resolve({ allowGlobalFallback: true });
  const response = await this.pointApiRequest<MpPaymentIntentResponse>(
    token,
    `/point/integration-api/devices/${env.MP_POS_DEVICE_ID}/payment-intents`,
    { method: "POST", body: JSON.stringify({ amount, ... }) },
    "Error al crear intención de cobro"
  );
}
```

**C.3) Middleware `mpContextMiddleware`**

**Archivo**: `apps/api/src/modules/mercadopago/mp-context.middleware.ts`

En modo single-seller no hay headers `X-Device-Id`/`X-Bar-Id` que extraer. El middleware existe para documentar el patrón y extender `Express.Request` con `mpContext`, dejando preparada la infraestructura por si en el futuro se agregan headers contextuales.

```ts
declare global {
  namespace Express {
    interface Request {
      mpContext?: CredentialContext;
    }
  }
}

// Se monta después de authMiddleware + requireRole.
export function mpContextMiddleware(_req: Request, _res: Response, next: NextFunction) {
  next();
}
```

En el controller, el patrón queda preparado:

```ts
router.post("/pos/intent", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
  const intent = await service.createPaymentIntent(amount, description);
  res.json(intent);
});
```

