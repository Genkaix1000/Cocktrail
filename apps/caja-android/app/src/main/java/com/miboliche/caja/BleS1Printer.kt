package com.miboliche.caja

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * GATT nativo para la Lujiang S1 (prefijo PPS1, servicio 0xFF00 / char 0xFF02).
 * El protocolo (chunks + delays) lo arma JS; acá solo connect + write.
 */
class BleS1Printer(private val activity: Activity) {
    private val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val main = Handler(Looper.getMainLooper())
    private val btManager = activity.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter: BluetoothAdapter? get() = btManager.adapter

    private var gatt: BluetoothGatt? = null
    private var writeChar: BluetoothGattCharacteristic? = null
    @Volatile private var connected = false

    fun isPaired(): Boolean = !savedAddress().isNullOrBlank()

    fun isConnected(): Boolean = connected && writeChar != null

    /** Scan + guarda address. Bloquea el hilo del bridge (no es el UI thread). */
    @SuppressLint("MissingPermission")
    fun pair(): String {
        ensurePermissions()?.let { return it }
        val adapter = adapter ?: return "Bluetooth no disponible en esta tablet."
        if (!adapter.isEnabled) return "Activá el Bluetooth de la tablet."

        disconnectQuiet()

        val found = AtomicReference<BluetoothDevice?>(null)
        val latch = CountDownLatch(1)
        val scanner = adapter.bluetoothLeScanner
            ?: return "Esta tablet no soporta Bluetooth Low Energy."

        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val device = result.device ?: return
                val name = result.scanRecord?.deviceName ?: device.name ?: return
                if (!name.startsWith(NAME_PREFIX)) return
                if (found.compareAndSet(null, device)) {
                    try {
                        scanner.stopScan(this)
                    } catch (_: Exception) {
                    }
                    latch.countDown()
                }
            }

            override fun onScanFailed(errorCode: Int) {
                latch.countDown()
            }
        }

        try {
            scanner.startScan(
                null,
                ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),
                callback,
            )
        } catch (e: SecurityException) {
            return "Falta permiso de Bluetooth. Tocá «Permitir» y reintentá."
        } catch (e: Exception) {
            return e.message ?: "No se pudo iniciar el escaneo Bluetooth."
        }

        val ok = latch.await(SCAN_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        try {
            scanner.stopScan(callback)
        } catch (_: Exception) {
        }

        val device = found.get()
        if (!ok || device == null) {
            return "No encontramos una impresora PPS1. Encendela y acercá la tablet."
        }

        prefs.edit().putString(KEY_ADDRESS, device.address).apply()
        return connectTo(device)
    }

    /** Reconecta a la address guardada. */
    @SuppressLint("MissingPermission")
    fun connect(): String {
        ensurePermissions()?.let { return it }
        val address = savedAddress() ?: return "No hay impresora Bluetooth vinculada."
        val adapter = adapter ?: return "Bluetooth no disponible en esta tablet."
        if (!adapter.isEnabled) return "Activá el Bluetooth de la tablet."
        if (isConnected() && gatt?.device?.address.equals(address, ignoreCase = true)) {
            return "ok"
        }
        disconnectQuiet()
        val device = try {
            adapter.getRemoteDevice(address)
        } catch (e: Exception) {
            return "Dirección Bluetooth inválida. Volvé a vincular."
        }
        return connectTo(device)
    }

    /**
     * JSON: `[{ "b": "<base64>", "d": 10 }, ...]` — b=bytes, d=delayAfterMs.
     */
    @SuppressLint("MissingPermission")
    fun printSteps(json: String): String {
        ensurePermissions()?.let { return it }
        if (!isConnected()) {
            val c = connect()
            if (c != "ok") return c
        }
        val char = writeChar ?: return "Sin característica de escritura BLE."
        val gatt = gatt ?: return "Sin conexión BLE."

        val steps = try {
            JSONArray(json)
        } catch (_: Exception) {
            return "Pasos de impresión inválidos."
        }

        for (i in 0 until steps.length()) {
            val step = steps.optJSONObject(i) ?: continue
            val b64 = step.optString("b", "")
            val delay = step.optLong("d", 0L)
            if (b64.isEmpty()) continue
            val bytes = try {
                Base64.decode(b64, Base64.DEFAULT)
            } catch (_: Exception) {
                return "Chunk BLE inválido."
            }
            char.value = bytes
            char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            val wrote = try {
                gatt.writeCharacteristic(char)
            } catch (e: SecurityException) {
                return "Falta permiso de Bluetooth para imprimir."
            }
            if (!wrote) return "Falló la escritura BLE (chunk $i)."
            if (delay > 0) {
                try {
                    Thread.sleep(delay)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    return "Impresión interrumpida."
                }
            }
        }
        return "ok"
    }

    @SuppressLint("MissingPermission")
    private fun connectTo(device: BluetoothDevice): String {
        val latch = CountDownLatch(1)
        val error = AtomicReference<String?>(null)
        val ready = AtomicBoolean(false)

        val callback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    connected = true
                    try {
                        g.discoverServices()
                    } catch (e: SecurityException) {
                        error.set("Falta permiso de Bluetooth.")
                        latch.countDown()
                    }
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    connected = false
                    writeChar = null
                    if (!ready.get()) {
                        error.compareAndSet(null, "Se cortó la conexión Bluetooth.")
                        latch.countDown()
                    }
                }
            }

            override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    error.set("No se pudieron descubrir servicios BLE.")
                    latch.countDown()
                    return
                }
                val service = g.getService(SERVICE_UUID)
                val characteristic = service?.getCharacteristic(WRITE_UUID)
                if (characteristic == null) {
                    error.set("La impresora no expone el servicio S1 (0xFF00).")
                    latch.countDown()
                    return
                }
                writeChar = characteristic
                gatt = g
                ready.set(true)
                latch.countDown()
            }
        }

        val g = try {
            if (Build.VERSION.SDK_INT >= 23) {
                device.connectGatt(activity, false, callback, BluetoothDevice.TRANSPORT_LE)
            } else {
                @Suppress("DEPRECATION")
                device.connectGatt(activity, false, callback)
            }
        } catch (e: SecurityException) {
            return "Falta permiso de Bluetooth."
        } catch (e: Exception) {
            return e.message ?: "No se pudo conectar por Bluetooth."
        }

        gatt = g
        val ok = latch.await(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        if (!ok) {
            disconnectQuiet()
            return "La impresora Bluetooth no responde. ¿Está encendida?"
        }
        error.get()?.let {
            disconnectQuiet()
            return it
        }
        if (!ready.get() || writeChar == null) {
            disconnectQuiet()
            return "No se pudo preparar la impresora Bluetooth."
        }
        return "ok"
    }

    @SuppressLint("MissingPermission")
    private fun disconnectQuiet() {
        connected = false
        writeChar = null
        try {
            gatt?.disconnect()
        } catch (_: Exception) {
        }
        try {
            gatt?.close()
        } catch (_: Exception) {
        }
        gatt = null
    }

    private fun savedAddress(): String? = prefs.getString(KEY_ADDRESS, null)?.trim()?.ifEmpty { null }

    /** null = OK; string = error. Pide permisos runtime si faltan. */
    private fun ensurePermissions(): String? {
        val needed = missingPermissions()
        if (needed.isEmpty()) return null
        main.post {
            ActivityCompat.requestPermissions(activity, needed.toTypedArray(), REQ_BLE)
        }
        // Dar tiempo al diálogo; el usuario reintenta si aún faltan.
        try {
            Thread.sleep(400)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
        if (missingPermissions().isNotEmpty()) {
            return "Hace falta permiso de Bluetooth. Aceptá el aviso y tocá Vincular de nuevo."
        }
        return null
    }

    private fun missingPermissions(): List<String> {
        val want = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 31) {
            want += Manifest.permission.BLUETOOTH_SCAN
            want += Manifest.permission.BLUETOOTH_CONNECT
        } else {
            want += Manifest.permission.ACCESS_FINE_LOCATION
        }
        return want.filter {
            ContextCompat.checkSelfPermission(activity, it) != PackageManager.PERMISSION_GRANTED
        }
    }

    companion object {
        private const val TAG = "BleS1Printer"
        private const val PREFS = "miboliche_ble"
        private const val KEY_ADDRESS = "s1_address"
        private const val NAME_PREFIX = "PPS1"
        private const val SCAN_TIMEOUT_MS = 12_000L
        private const val CONNECT_TIMEOUT_MS = 8_000L
        private const val REQ_BLE = 4401

        private val SERVICE_UUID: UUID = uuidFromShort(0xff00)
        private val WRITE_UUID: UUID = uuidFromShort(0xff02)

        private fun uuidFromShort(short: Int): UUID {
            val s = "%04x".format(short)
            return UUID.fromString("0000$s-0000-1000-8000-00805f9b34fb")
        }
    }
}
