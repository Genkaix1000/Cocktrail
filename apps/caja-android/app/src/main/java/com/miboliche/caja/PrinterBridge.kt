package com.miboliche.caja

import android.webkit.JavascriptInterface

/**
 * Puente JS ↔ USB. Expuesto como window.MiBolichePrinter en el WebView.
 */
class PrinterBridge(private val printer: UsbEscPosPrinter) {
    @JavascriptInterface
    fun print(base64: String): String = printer.printBase64(base64)

    @JavascriptInterface
    fun isConnected(): Boolean = printer.isConnected()

    @JavascriptInterface
    fun requestPermission() {
        printer.requestPermissionForFirst()
    }
}
