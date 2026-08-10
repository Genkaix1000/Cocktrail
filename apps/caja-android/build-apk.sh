#!/usr/bin/env bash
# Compila el APK de caja y lo copia a apps/web/public/miboliche-caja.apk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/apps/caja-android"
WEB_PUBLIC="$ROOT/apps/web/public"

pick_java_home() {
  if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
    echo "$JAVA_HOME"
    return
  fi
  local candidates=(
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
    "/usr/lib/jvm/default"
    "/usr/lib/jvm/default-runtime"
    "/usr/lib/jvm/java-17-openjdk"
    "/usr/lib/jvm/java-21-openjdk"
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -x "$c/bin/java" ]]; then
      echo "$c"
      return
    fi
  done
  return 1
}

pick_android_home() {
  if [[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME" ]]; then
    echo "$ANDROID_HOME"
    return
  fi
  local candidates=(
    "$HOME/Library/Android/sdk"
    "$HOME/Android/Sdk"
    "/opt/android-sdk"
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -d "$c" ]]; then
      echo "$c"
      return
    fi
  done
  return 1
}

export JAVA_HOME
JAVA_HOME="$(pick_java_home)" || {
  echo "No encontré JDK. Abrí Android Studio una vez o seteá JAVA_HOME."
  exit 1
}
export ANDROID_HOME
ANDROID_HOME="$(pick_android_home)" || {
  echo "No encontré Android SDK. Seteá ANDROID_HOME."
  exit 1
}

cd "$APP"
if [[ ! -f ./gradlew ]]; then
  echo "Falta gradlew — regenerá el wrapper (ver README)."
  exit 1
fi

./gradlew :app:assembleRelease --quiet
cp -f "$APP/app/build/outputs/apk/release/app-release.apk" "$WEB_PUBLIC/miboliche-caja.apk"
echo "OK → $WEB_PUBLIC/miboliche-caja.apk ($(du -h "$WEB_PUBLIC/miboliche-caja.apk" | awk '{print $1}'))"
