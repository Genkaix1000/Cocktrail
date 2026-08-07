import { afterEach, describe, expect, it } from "vitest";

import { selectTransport } from "./select-transport";
import { BLE_PRINTER_ID_KEY } from "./transports/ble-s1";

function stubNative() {
  (window as unknown as Record<string, unknown>).MiBolichePrinter = {
    print: () => "ok",
    isConnected: () => true,
    requestPermission: () => {},
  };
}

function stubNavigatorProp(name: "bluetooth" | "usb") {
  Object.defineProperty(navigator, name, {
    value: { getDevices: async () => [] },
    configurable: true,
  });
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).MiBolichePrinter;
  delete (navigator as unknown as Record<string, unknown>).bluetooth;
  delete (navigator as unknown as Record<string, unknown>).usb;
  localStorage.clear();
});

describe("selectTransport", () => {
  it("el puente nativo gana siempre (en el WebView del APK no hay BLE)", () => {
    stubNative();
    stubNavigatorProp("bluetooth");
    stubNavigatorProp("usb");
    localStorage.setItem(BLE_PRINTER_ID_KEY, "dev-1");

    expect(selectTransport()?.id).toBe("native");
  });

  it("BLE vinculada le gana a WebUSB", () => {
    stubNavigatorProp("bluetooth");
    stubNavigatorProp("usb");
    localStorage.setItem(BLE_PRINTER_ID_KEY, "dev-1");

    expect(selectTransport()?.id).toBe("ble-s1");
  });

  it("con Bluetooth disponible pero sin S1 vinculada cae a WebUSB", () => {
    stubNavigatorProp("bluetooth");
    stubNavigatorProp("usb");

    expect(selectTransport()?.id).toBe("webusb");
  });

  it("id guardado sin API Bluetooth no alcanza: cae a WebUSB", () => {
    stubNavigatorProp("usb");
    localStorage.setItem(BLE_PRINTER_ID_KEY, "dev-1");

    expect(selectTransport()?.id).toBe("webusb");
  });

  it("sin nativo, sin BLE vinculada y sin WebUSB devuelve null", () => {
    stubNavigatorProp("bluetooth");
    expect(selectTransport()).toBeNull();
  });

  it("entorno pelado (sin nada) devuelve null", () => {
    expect(selectTransport()).toBeNull();
  });
});
