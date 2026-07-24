package com.miboliche.caja

import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Encuentra el servidor en la LAN sin pedirle la IP al usuario: barre el /24 de
 * la tablet buscando quien responda el endpoint público de la app.
 *
 * ponytail: escaneo /24 con pool fijo. Si alguna vez hay varias subredes o /16,
 * pasar a mDNS (NsdManager) + advertising en el server.
 */
object ServerFinder {
    const val PORT = 3000
    private const val PROBE_PATH = "/api/auth/me"

    fun localIpv4(): String? {
        for (iface in NetworkInterface.getNetworkInterfaces()) {
            if (!iface.isUp || iface.isLoopback) continue
            for (addr in iface.inetAddresses) {
                if (addr is Inet4Address && !addr.isLoopbackAddress) {
                    return addr.hostAddress
                }
            }
        }
        return null
    }

    /** Devuelve `http://ip:3000` del primero que contesta, o null. */
    fun discover(perHostTimeoutMs: Int = 500, totalTimeoutMs: Long = 9000): String? {
        val local = localIpv4() ?: return null
        val prefix = local.substringBeforeLast('.', "")
        if (prefix.isEmpty()) return null

        val found = AtomicReference<String?>(null)
        val pool = Executors.newFixedThreadPool(48)
        val latch = CountDownLatch(254)
        try {
            for (i in 1..254) {
                val host = "$prefix.$i"
                pool.execute {
                    try {
                        if (found.get() == null && probe(host, perHostTimeoutMs)) {
                            found.compareAndSet(null, "http://$host:$PORT")
                        }
                    } catch (_: Exception) {
                    } finally {
                        latch.countDown()
                    }
                }
            }
            latch.await(totalTimeoutMs, TimeUnit.MILLISECONDS)
        } finally {
            pool.shutdownNow()
        }
        return found.get()
    }

    /** true si `base` (http://ip:puerto) es un servidor de la app. */
    fun isServer(base: String, timeoutMs: Int = 2500): Boolean {
        val url = try {
            URL("${base.trimEnd('/')}$PROBE_PATH")
        } catch (_: Exception) {
            return false
        }
        return request(url, timeoutMs)
    }

    private fun probe(host: String, timeoutMs: Int): Boolean =
        request(URL("http://$host:$PORT$PROBE_PATH"), timeoutMs)

    private fun request(url: URL, timeoutMs: Int): Boolean {
        var conn: HttpURLConnection? = null
        return try {
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                instanceFollowRedirects = false
            }
            // 200 = sin sesión devuelve null; 401 = existe pero pide login.
            // Cualquiera de las dos prueba que es nuestro server, no otro equipo.
            conn.responseCode in intArrayOf(200, 401)
        } catch (_: Exception) {
            false
        } finally {
            conn?.disconnect()
        }
    }
}
