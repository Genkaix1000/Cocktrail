# Resumen para Soporte de MercadoPago — Integración Cocktrail / BarQR

> **Propósito**: Documento breve preparado para consultar al soporte técnico o representante comercial/integrador de MercadoPago sobre límites, normativas y comportamiento esperado de la integración.

---

## 1. Contexto de la Integración

Cocktrail integra MercadoPago mediante dos mecanismos:
1. **QR Dinámico / Estático de Caja (In-store API / POS Integration)**: Para generación de órdenes de pago por QR.
2. **Point Integration API**: Para el envío de montos a cobrar hacia terminales físicas Point (ej. PAX A910) configuradas en modo PDV (Punto de Venta).

---

## 2. Puntos Clave a Consultar al Soporte de MercadoPago

### A. Cambio de Titularidad y Vinculación de Terminales Point
- **Pregunta**: Si una terminal Point (ej. PAX A910) se encuentra asociada/reclamada en una cuenta de vendedor de prueba o cuenta anterior, ¿cuál es el procedimiento oficial para desvincularla e integrarla a una nueva cuenta de vendedor (seller)?
- **Motivo de consulta**: Validar si el cierre de sesión en el aparato libera el dispositivo o si es obligatorio darlo de baja desde el panel web de la cuenta titular original.

### B. Modo de Operación de la Terminal (PDV vs. STANDALONE)
- **Pregunta**: ¿El cambio de modo de operación de la terminal Point de `STANDALONE` a `PDV` realizado vía la API (`PATCH /point/integration-api/devices/{device_id}`) requiere intervención o reinicio manual del dispositivo físico por parte del cajero?
- **Motivo de consulta**: Asegurar que los envíos automáticos de cobro no queden en espera si la terminal no está en pantalla de recepción de pagos.

### C. Límites de Tasa (Rate Limits) y Frecuencia de Polling de Webhooks/Status
- **Pregunta**: ¿Existe alguna restricción o rate limit estricto sobre las llamadas a `/v1/payments/{id}` o `/pos/{external_pos_id}/orders` cuando se realiza polling de estado en caso de demoras en la llegada de webhooks en zonas con baja conectividad?
- **Motivo de consulta**: Prevenir bloqueos temporales de IP o de Token durante picos de transacciones en horas de alto flujo (noches de evento).

---

## 3. Checklist de Seguridad Operativa Validada con MP

- [x] Los `access_token` utilizados en peticiones servidor a servidor nunca se exponen al cliente frontend.
- [x] Las notificaciones Webhook verifican la firma y el encabezado `x-signature` antes de procesar el estado pagado.
- [x] Todas las órdenes enviadas utilizan `external_reference` único para prevenir cobros duplicados.
