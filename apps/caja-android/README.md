# miBoliche Caja — shell Android

WebView a pantalla completa de `/login` + impresión USB nativa
(`window.MiBolichePrinter`). Sin Chrome y sin HTTPS local.

Por defecto la app se conecta a la **nube** (`https://miboliche.online`).
Si la nube no responde, muestra `assets/connect.html` para buscar un servidor
en la LAN (`ServerFinder`) o escribir la IP a mano. Desde `/admin` → Sistema
(en el WebView) también se puede cambiar entre nube y WiFi local.

Ante un corte, el shell reintenta el server guardado ~20s antes de mostrar esa
pantalla, y al volver reabre la última ruta visitada (no `/login`): un microcorte
de WiFi ya no manda a la cajera a loguearse de nuevo.

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
2. Abrir **miBoliche Caja** → conecta a la nube sola.
3. Enchufar la ticketera → aceptar el permiso USB (conviene "usar siempre").
4. (Opcional) En Sistema → **Buscar en WiFi local** para apuntar a una PC del local.

Long-press en cualquier parte de la pantalla reabre el cambio de servidor.

## Icono

Los mipmaps se generan desde `apps/web/public/app-icon.png`.
