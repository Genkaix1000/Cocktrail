import { afterEach, describe, expect, it } from "vitest";

import { selectTransport } from "./select-transport";
import { BLE_PRINTER_ID_KEY } from "./transports/ble-s1";

function stubNativeUsb(connected = true) {
  (window as unknown as Record<string, unknown>).MiBolichePrinter = {
    print: () => "ok",
    isConnected: () => connected,
    requestPermission: () => {},
    blePair: () => "ok",
    bleIsPaired: () => false,
    bleIsConnected: () => false,
    bleConnect: () => "ok",
    blePrintSteps: () => "ok",
  };
}

function stubNativeUsbOnly(connected = true) {
  (window as unknown as Record<string, unknown>).MiBolichePrinter = {
    print: () => "ok",
    isConnected: () => connected,
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
  it("APK con USB enchufado usa el puente USB", () => {
    stubNativeUsb(true);
    stubNavigatorProp("bluetooth");
    stubNavigatorProp("usb");
    localStorage.setItem(BLE_PRINTER_ID_KEY, "dev-1");

    expect(selectTransport()?.id).toBe("native");
  });

  it("APK sin USB usa BLE nativo S1", () => {
    stubNativeUsb(false);
    expect(selectTransport()?.id).toBe("native-ble-s1");
  });

  it("APK viejo sin blePair y sin USB sigue en native", () => {
    stubNativeUsbOnly(false);
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
