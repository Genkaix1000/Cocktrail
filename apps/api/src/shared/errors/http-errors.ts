/** 400 — input inválido del cliente. */
export class BadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequest";
  }
}

/** 401 — no autenticado. */
export class Unauthorized extends Error {
  constructor(message = "No autenticado") {
    super(message);
    this.name = "Unauthorized";
  }
}

/** 403 — no autorizado (rol insuficiente). */
export class Forbidden extends Error {
  constructor(message = "No autorizado") {
    super(message);
    this.name = "Forbidden";
  }
}

/** 404 — recurso inexistente. */
export class NotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFound";
  }
}

/** 409 — el estado del recurso no permite la operación. */
export class Conflict extends Error {
  /**
   * `code` es un identificador estable y machine-readable (ej. "DEVICE_BUSY")
   * para que el frontend pueda actuar sin parsear el `message` humano — que
   * puede cambiar de texto o venir con datos crudos de un proveedor externo
   * (ver `MpApiError` en mercadopago.service.ts).
   */
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "Conflict";
  }
}
