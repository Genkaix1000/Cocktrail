#!/usr/bin/env bash
# Compila el APK de caja y lo copia a apps/web/public/miboliche-caja.apk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/apps/caja-android"
WEB_PUBLIC="$ROOT/apps/web/public"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

if [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "No encontré JDK. Abrí Android Studio una vez o seteá JAVA_HOME."
  exit 1
fi

cd "$APP"
if [[ ! -f ./gradlew ]]; then
  echo "Falta gradlew — regenerá el wrapper (ver README)."
  exit 1
fi

./gradlew :app:assembleRelease --quiet
cp -f "$APP/app/build/outputs/apk/release/app-release.apk" "$WEB_PUBLIC/miboliche-caja.apk"
echo "OK → $WEB_PUBLIC/miboliche-caja.apk ($(du -h "$WEB_PUBLIC/miboliche-caja.apk" | awk '{print $1}'))"
