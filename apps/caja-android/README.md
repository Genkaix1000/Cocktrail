# miBoliche Caja — shell Android

WebView a pantalla completa de `/caja` + impresión USB nativa
(`window.MiBolichePrinter`). Sin Chrome y sin HTTPS.

El servidor **no se hardcodea**: al primer arranque la app barre el /24 de la
tablet buscando quién responde `/api/auth/me` (ver `ServerFinder.kt`). Si no lo
encuentra, ofrece escribir la dirección a mano (la muestra `/admin` → Sistema).

## Build

Requisitos: Android Studio (aporta el JDK) o SDK + JDK 17+.

```bash
pnpm build:caja-apk
```

Deja `apps/web/public/miboliche-caja.apk`, que es lo que sirve el botón
**Descargar app** de `/admin` → Sistema.

Primera vez, si falta `gradlew`:

```bash
cd apps/caja-android
gradle wrapper --gradle-version 8.11.1
```

## Uso en la tablet

1. Bajar e instalar el APK desde Sistema.
2. Abrir **miBoliche Caja** → busca el servidor sola.
3. Enchufar la ticketera → aceptar el permiso USB (conviene "usar siempre").

Long-press en cualquier parte de la pantalla reabre el cambio de servidor.

## Icono

Los mipmaps se generan desde `apps/web/public/app-icon.png`.
