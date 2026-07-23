# Evaluación Técnica de Recomendaciones y Viabilidad en Cocktrail

> **Propósito**: Analizar la aplicabilidad real de los hallazgos y técnicas propuestas para Cocktrail, identificando cuáles son necesarias, cuáles son prescindibles y cuáles representan sobreingeniería para el caso de uso del boliche.

---

## 1. Análisis Criterio por Criterio: ¿Aplica o No Aplica?

### 1. Cifrado de Tokens OAuth de MercadoPago en Base de Datos (AES-256 / pgcrypto)
- **Técnica propuesta**: Cifrar los `access_token` y `refresh_token` almacenados en `mercadopago_sellers`.
- **¿Aplica a Cocktrail?**: **Sí, pero con matices.**
- **Justificación**: La mini-PC local en el boliche puede ser físicamente accesible o robada. Si la base de datos se extrae sin cifrar, los tokens permiten realizar operaciones financieras en nombre de la cuenta del boliche. Sin embargo, si la clave de cifrado vive en el mismo archivo `.env` de la mini-PC, el atacante con acceso al disco igual podrá descifrarlo.
- **Veredicto**: Recomendado cifrar si la clave de cifrado se inyecta desde variable de entorno de entorno de producción o vault, evitando dejarla expuesta en scripts plain text.

### 2. Aislamiento de Red Wi-Fi (VLANs / Red de Clientes vs. Red Operativa)
- **Técnica propuesta**: Configurar la Wi-Fi del boliche con aislamiento de clientes (AP Isolation) o VLAN separada para staff/posnets.
- **¿Aplica a Cocktrail?**: **Sí, es indispensable en infraestructura.**
- **Justificación**: Los clientes en la barra leen un QR y entran a `/carta`. Si están en la misma subnet broadcast que la mini-PC local y las tablets de caja/barra, un usuario malintencionado con herramientas básicas de red puede escanear puertos localmente.
- **Veredicto**: **Crítico a nivel de red/infraestructura física del boliche**, no requiere cambios de código en la aplicación, solo configuración de router/Access Point.

### 3. Revocación Masiva de Permisos PostgREST (`anon` / `authenticated`)
- **Técnica propuesta**: Revocar permisos `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon`.
- **¿Aplica a Cocktrail?**: **Sí, totalmente.**
- **Justificación**: En la auditoría de migraciones legacy se detectó que tablas históricas como `orders`, `tickets` o `users` tenían permisos universales para el rol `anon`. En un esquema donde la API Express controla el acceso y valida tokens JWT, exponérselo a PostgREST sin RLS estricto es un riesgo innecesario.
- **Veredicto**: **Aplica prioritariamente.** Se debe incluir la limpieza de permisos en migraciones de base de datos.

### 4. Idempotencia Extrema con Semilla Única en Pedidos e Intents de Pago
- **Técnica propuesta**: Generar semillas de idempotencia (`external_reference`) únicas en la creación de cobros y pedidos.
- **¿Aplica a Cocktrail?**: **Sí, aplica.**
- **Justificación**: En un entorno de boliche con Wi-Fi inestable, los reintentos automáticos del cliente o de la cajera pueden mandar 2 o más solicitudes idénticas. Sin idempotencia, esto puede derivar en cobros dobles o tickets duplicados.
- **Veredicto**: **Aplica.** Ya se contempla en el flujo de integración de MP y debe mantenerse como regla estricta.

---

## 2. Resumen de Técnicas Descartadas por Sobreingeniería

1. **Implementación de WAF (Web Application Firewall) local**:
   - *Razón*: Innecesario para el servidor de boliche que opera en LAN aislada. Genera sobrecarga de procesamiento sin beneficio tangible.
2. **Autenticación mTLS (TLS Mutuo) entre tablets y servidor local**:
   - *Razón*: Dificulta masivamente el provisionamiento de dispositivos en el boliche y la rotación de hardware. Se resuelve con HTTPS + tokens de sesión locales.
