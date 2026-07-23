# Auditoría de Seguridad y Arquitectura — Cocktrail / BarQR

> **Fecha**: Julio 2026  
> **Sistema**: Cocktrail / BarQR (Cobro y gestión de tragos local-first para boliches)  
> **Arquitectura base**: Node.js/Express 5 (API) + Next.js 16 (Web) + Supabase/PostgreSQL (DB local) + Integración MercadoPago (QR & Point API).

---

## 1. Resumen Ejecutivo del Estado de Seguridad

Cocktrail opera bajo un modelo **Local-First + Cloud Diferida**, lo que reduce drásticamente la exposición pública del backend y la base de datos durante la noche operativa. Sin embargo, la seguridad local en el entorno físico (red Wi-Fi del boliche, mini-PC local, dispositivos de barra y caja) presenta vectores específicos que deben protegerse.

---

## 2. Análisis de la Superficie de Ataque por Capa

### A. Red Local (Wi-Fi de Clientes y Staff)
- **Riesgo**: Clientes escaneando QRs se conectan a la LAN local del boliche. Si la red no está adecuadamente aislada (VLANs), un cliente podría intentar acceder a la API de `/admin`, `/caja` o directamente a la base de datos Supabase/Postgres.
- **Estado/Recomendación**: La red debe separar obligatoriamente la Wi-Fi de clientes (aislada, solo acceso a `/carta` y `/pedido`) de la red administrativa/TPV (posnets, tablets de barra, caja).

### B. Capa de Datos (Supabase / Postgres Local)
- **Riesgo**: Permisos permisivos heredados (`GRANT ALL ON TABLES TO anon, authenticated`). Si el rol `anon` de PostgREST puede leer/escribir tablas legacy o de configuración, se podrían manipular datos sin autenticación.
- **Estado/Recomendación**: Revocación explícita de permisos (`REVOKE ALL ON public FROM anon`) salvo en vistas públicas estrictamente necesarias para el menú/tragos.

### C. Credenciales y Tokens de Integración (MercadoPago)
- **Riesgo**: Los tokens OAuth (`access_token`, `refresh_token` de vendedores) persistidos en texto plano en la tabla `mercadopago_sellers` representan un riesgo severo si se extrae una copia de la base de datos local.
- **Estado/Recomendación**: Aplicar cifrado simétrico en reposo (ej. AES-256-GCM o `pgcrypto`) para la columna `access_token` y `refresh_token`.

### D. Integridad del Cobro y Pedidos
- **Riesgo**: Carrera de peticiones (race conditions) o duplicación de pedidos si falla la conexión LAN durante la confirmación de la venta en `/caja` o `/carta`.
- **Estado/Recomendación**: Requerir claves de idempotencia únicas (`external_reference` / UUID de transacción) en cada creación de intent de cobro y pedido.

---

## 3. Estado de Cumplimiento de Controles Clave

| Control de Seguridad | Estado | Impacto si Falta |
|---|---|---|
| **Validación de Input (Zod)** | Parcial | Inyección de payloads malformados en API |
| **Separación de Roles (RBAC)** | Implementado | Acceso no autorizado a funciones de Admin/Caja |
| **Cifrado de Tokens MP en DB** | Pendiente | Exposición de credenciales de cobro |
| **Validación de Webhooks MP** | En proceso | Falsificación de notificaciones de pago pagadas |
| **Aislamiento de VLAN Wi-Fi** | Requiere Infra | Escaneo de red local por parte de clientes |
