# Changelog

Cambios notables de Cocktrail / miBoliche, por versión.
Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
El canal actual es **beta** hasta marcar `stable`.

## [0.1.1] - 2026-09-04

### Added

- Nueva Venta en el menú de admin (mismo POS que caja).
- Herramientas de diagnóstico avanzado y sanidad de Mercado Pago.
- Biblioteca de imágenes de carta (estáticos + upload con crop 512×512) y preview tipo Nueva venta.
- Vigencia horaria de promos (gris + aviso, ocultar, mover categoría, repetir cada noche).
- Impresión en papeles divididos (un cobro, N tickets).

### Changed

- **Sistema:** Rediseño completo de la página de Sistema. Ahora ocupa todo el ancho, utiliza badges modernos para la versión y canal, y permite expandir los detalles de entorno/deploy solo cuando es necesario.
- Mejoras de rendimiento en sincronización y gestión de órdenes.
- Mejor tolerancia a errores en migraciones de base de datos (`storage` en local).
- Placeholder de nombre de trago orientado a promos (`PROMO 2 …`) para tickets claros.

## [0.1.0] - 2026-08-09

Primera beta pública.

### Added

- Tours de ayuda contextuales por sección (admin y caja), con demo de Auditoría sin abrir noche.
- Panel de versión y deploy en Sistema (`0.1.0-beta`, hosting, commit, uptime).
- Herramientas de desarrollador de Mercado Pago al final de Pagos, con órdenes/webhooks de a 5.
- Editor de categorías de Carta con reorder por puntero (fantasma + línea de inserción).

### Changed

- Flujos de cobro en caja más claros (métodos disponibles, QR, noches de prueba).
- Sanidad y diagnóstico MP separados del flujo principal de vinculación.

### Removed

- Tours lineales huérfanos, demo `?demo=true`, cliente web de canje de tickets y handoff MP.
- Endpoints `/api/system/status` y `/shutdown`.
- Tablas muertas `cash_sales` y `mercadopago_seller_handoff`; columnas `sync_status`/`synced_at`.
