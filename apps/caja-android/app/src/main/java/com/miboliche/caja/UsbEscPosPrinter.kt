package com.miboliche.caja

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import android.util.Log

/**
 * Escanea USB host, pide permiso y escribe bytes ESC/POS crudos.
 * ponytail: primer device con bulk OUT; si hay varias ticketeras, filtrar por vendorId.
 */
class UsbEscPosPrinter(private val context: Context) {
    private val usb: UsbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private var device: UsbDevice? = null
    private var connection: UsbDeviceConnection? = null
    private var outEp: UsbEndpoint? = null

    var onStatusChanged: (() -> Unit)? = null

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.action != ACTION_USB_PERMISSION) return
            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            val dev = extraDevice(intent)
            if (granted && dev != null) {
                open(dev)
            }
            onStatusChanged?.invoke()
        }
    }

    private val attachReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            when (intent.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    requestPermissionForFirst()
                    onStatusChanged?.invoke()
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    val dev = extraDevice(intent)
                    if (dev != null && device?.deviceId == dev.deviceId) {
                        close()
                    }
                    onStatusChanged?.invoke()
                }
            }
        }
    }

    private fun extraDevice(intent: Intent): UsbDevice? =
        if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
        }

    fun register() {
        val permFilter = IntentFilter(ACTION_USB_PERMISSION)
        val attachFilter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            context.registerReceiver(permissionReceiver, permFilter, Context.RECEIVER_NOT_EXPORTED)
            context.registerReceiver(attachReceiver, attachFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(permissionReceiver, permFilter)
            context.registerReceiver(attachReceiver, attachFilter)
        }
        // Si ya hay permiso de una sesión anterior, abrir sin diálogo.
        findCandidate()?.let { candidate ->
            if (usb.hasPermission(candidate)) open(candidate)
        }
    }

    fun unregister() {
        try {
            context.unregisterReceiver(permissionReceiver)
        } catch (_: Exception) {
        }
        try {
            context.unregisterReceiver(attachReceiver)
        } catch (_: Exception) {
        }
        close()
    }

    fun isConnected(): Boolean = connection != null && outEp != null

    /** Dispara el diálogo nativo de Android si hace falta. */
    fun requestPermissionForFirst() {
        val candidate = findCandidate() ?: return
        if (usb.hasPermission(candidate)) {
            open(candidate)
            onStatusChanged?.invoke()
            return
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val pi = PendingIntent.getBroadcast(context, 0, Intent(ACTION_USB_PERMISSION), flags)
        usb.requestPermission(candidate, pi)
    }

    fun printBase64(base64: String): String {
        val conn = connection
        val ep = outEp
        if (conn == null || ep == null) {
            return "No hay impresora conectada. Enchufá la impresora y aceptá el permiso."
        }
        return try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            // Chunks: algunos clones fallan con transfers muy grandes.
            var offset = 0
            while (offset < bytes.size) {
                val len = minOf(CHUNK, bytes.size - offset)
                val written = conn.bulkTransfer(ep, bytes, offset, len, TIMEOUT_MS)
                if (written < 0) return "Error USB al imprimir (bulkTransfer=$written)"
                offset += written
            }
            "ok"
        } catch (e: Exception) {
            Log.e(TAG, "print failed", e)
            e.message ?: "Error al imprimir"
        }
    }

    private fun findCandidate(): UsbDevice? {
        for (dev in usb.deviceList.values) {
            if (findBulkOut(dev) != null) return dev
        }
        return null
    }

    private fun findBulkOut(dev: UsbDevice): Pair<Int, UsbEndpoint>? {
        for (i in 0 until dev.interfaceCount) {
            val iface = dev.getInterface(i)
            for (e in 0 until iface.endpointCount) {
                val ep = iface.getEndpoint(e)
                if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK &&
                    ep.direction == UsbConstants.USB_DIR_OUT
                ) {
                    return i to ep // índice para getInterface(), no iface.id
                }
            }
        }
        return null
    }

    private fun open(dev: UsbDevice) {
        close()
        val found = findBulkOut(dev) ?: return
        val (ifaceIndex, ep) = found
        val conn = usb.openDevice(dev) ?: return
        if (!conn.claimInterface(dev.getInterface(ifaceIndex), true)) {
            conn.close()
            return
        }
        device = dev
        connection = conn
        outEp = ep
        Log.i(TAG, "opened ${dev.deviceName} iface=$ifaceIndex ep=${ep.address}")
    }

    private fun close() {
        try {
            connection?.close()
        } catch (_: Exception) {
        }
        connection = null
        outEp = null
        device = null
    }

    companion object {
        private const val TAG = "UsbEscPos"
        private const val ACTION_USB_PERMISSION = "com.miboliche.caja.USB_PERMISSION"
        private const val TIMEOUT_MS = 5000
        private const val CHUNK = 16384
    }
}
