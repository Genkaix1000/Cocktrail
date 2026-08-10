package com.miboliche.caja

import android.webkit.JavascriptInterface

/**
 * Puente JS ↔ USB + BLE S1. Expuesto como window.MiBolichePrinter en el WebView.
 */
class PrinterBridge(
    private val usb: UsbEscPosPrinter,
    private val ble: BleS1Printer,
) {
    @JavascriptInterface
    fun print(base64: String): String = usb.printBase64(base64)

    @JavascriptInterface
    fun isConnected(): Boolean = usb.isConnected()

    @JavascriptInterface
    fun requestPermission() {
        usb.requestPermissionForFirst()
    }

    @JavascriptInterface
    fun blePair(): String = ble.pair()

    @JavascriptInterface
    fun bleIsPaired(): Boolean = ble.isPaired()

    @JavascriptInterface
    fun bleIsConnected(): Boolean = ble.isConnected()

    @JavascriptInterface
    fun bleConnect(): String = ble.connect()

    /** JSON steps: [{b: base64, d: delayMs}, ...] */
    @JavascriptInterface
    fun blePrintSteps(json: String): String = ble.printSteps(json)
}
