package com.miboliche.caja

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/**
 * Shell de caja: WebView a pantalla completa + impresión USB nativa.
 * El servidor se descubre solo en la LAN (ServerFinder) — la IP no se hardcodea.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var printer: UsbEscPosPrinter
    private val main = Handler(Looper.getMainLooper())
    private var operationId = 0
    private var connectPageReady = false
    private var pendingState = "searching"
    private var pendingMessage = SEARCHING_MESSAGE

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        printer = UsbEscPosPrinter(this)
        printer.register()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mediaPlaybackRequiresUserGesture = false
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            addJavascriptInterface(PrinterBridge(printer), "MiBolichePrinter")
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    val uri = request.url
                    if (uri.scheme != APP_SCHEME) return false
                    when (uri.host) {
                        "discover" -> startDiscovery()
                        "connect" -> connectManually(uri.getQueryParameter("server").orEmpty())
                    }
                    return true
                }

                override fun onPageFinished(view: WebView, url: String) {
                    if (url.startsWith(CONNECT_PAGE)) {
                        connectPageReady = true
                        applyConnectState()
                    }
                }

                // Cubre también las navegaciones client-side de Next (pushState),
                // que no disparan onPageFinished.
                override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                    if (url.startsWith("http")) savePath(url)
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    if (request.isForMainFrame && request.url.scheme in listOf("http", "https")) {
                        reconnect()
                    }
                }
            }
            setOnLongClickListener {
                operationId++
                showConnectionPage("idle", MANUAL_MESSAGE)
                true
            }
        }

        setContentView(webView)
        startDiscovery()
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
    }

    override fun onDestroy() {
        printer.unregister()
        webView.destroy()
        super.onDestroy()
    }

    // ---------- servidor ----------

    private fun prefs() = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun savedServer(): String? = prefs().getString(KEY_SERVER, null)

    private fun saveServer(base: String) {
        prefs().edit().putString(KEY_SERVER, base.trimEnd('/')).apply()
    }

    /** Última pantalla abierta: al reconectar se vuelve ahí, no al login. */
    private fun savePath(url: String) {
        val path = Uri.parse(url).path?.takeIf { it.isNotEmpty() } ?: return
        prefs().edit().putString(KEY_PATH, path).apply()
    }

    private fun loadServer(base: String) {
        connectPageReady = false
        webView.loadUrl("${base.trimEnd('/')}${prefs().getString(KEY_PATH, null) ?: "/login"}")
    }

    /**
     * Un microcorte de WiFi no puede expulsar a la caja al buscador de servidores:
     * se sondea el server guardado unas cuantas veces antes de darlo por perdido.
     */
    private fun reconnect() {
        val base = savedServer()
        if (base == null) {
            operationId++
            showConnectionPage("error", LOAD_FAILED_MESSAGE)
            return
        }

        val currentOperation = ++operationId
        showConnectionPage("searching", RECONNECTING_MESSAGE)
        Thread {
            repeat(RECONNECT_ATTEMPTS) {
                if (currentOperation != operationId) return@Thread
                if (ServerFinder.isServer(base)) {
                    main.post {
                        if (currentOperation != operationId) return@post
                        loadServer(base)
                    }
                    return@Thread
                }
                Thread.sleep(RECONNECT_DELAY_MS)
            }
            main.post {
                if (currentOperation != operationId) return@post
                showConnectionPage("error", LOAD_FAILED_MESSAGE)
            }
        }.start()
    }

    private fun startDiscovery() {
        val currentOperation = ++operationId
        showConnectionPage("searching", SEARCHING_MESSAGE)
        Thread {
            val saved = savedServer()
            val found = saved?.takeIf { ServerFinder.isServer(it) } ?: ServerFinder.discover()
            main.post {
                if (currentOperation != operationId) return@post
                if (found == null) {
                    showConnectionPage("error", NOT_FOUND_MESSAGE)
                } else {
                    saveServer(found)
                    loadServer(found)
                }
            }
        }.start()
    }

    private fun connectManually(input: String) {
        val target = normalizeServer(input)
        if (target == null) {
            showConnectionPage("error", INVALID_ADDRESS_MESSAGE)
            return
        }

        val currentOperation = ++operationId
        showConnectionPage("connecting", "Comprobando $target…")
        Thread {
            val connected = ServerFinder.isServer(target)
            main.post {
                if (currentOperation != operationId) return@post
                if (connected) {
                    saveServer(target)
                    loadServer(target)
                } else {
                    showConnectionPage("error", ADDRESS_FAILED_MESSAGE)
                }
            }
        }.start()
    }

    private fun normalizeServer(input: String): String? {
        var value = input.trim().trimEnd('/')
        if (value.isEmpty()) return null
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "http://$value"
        }
        val uri = Uri.parse(value)
        val scheme = uri.scheme?.takeIf { it == "http" || it == "https" } ?: return null
        val host = uri.host ?: return null
        val port = if (uri.port == -1) ServerFinder.PORT else uri.port
        return "$scheme://$host:$port"
    }

    // ---------- pantalla local de conexión ----------

    private fun showConnectionPage(state: String, message: String) {
        pendingState = state
        pendingMessage = message
        if (connectPageReady && webView.url?.startsWith(CONNECT_PAGE) == true) {
            applyConnectState()
        } else {
            connectPageReady = false
            webView.loadUrl(CONNECT_PAGE)
        }
    }

    private fun applyConnectState() {
        val state = JSONObject.quote(pendingState)
        val message = JSONObject.quote(pendingMessage)
        val saved = JSONObject.quote(savedServer().orEmpty())
        webView.evaluateJavascript("window.miBoliche.setState($state,$message,$saved)", null)
    }

    private fun hideSystemUi() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }

    companion object {
        private const val PREFS = "miboliche_caja"
        private const val KEY_SERVER = "server_base"
        private const val KEY_PATH = "last_path"
        private const val APP_SCHEME = "miboliche"
        private const val CONNECT_PAGE = "file:///android_asset/connect.html"

        // ~20s de tolerancia (isServer corta a 2.5s por intento) — cubre el
        // microcorte de WiFi sin dejar colgada una tablet con el server caído.
        private const val RECONNECT_ATTEMPTS = 5
        private const val RECONNECT_DELAY_MS = 1500L

        private const val RECONNECTING_MESSAGE =
            "Se cortó la conexión con el servidor. Reintentando…"
        private const val SEARCHING_MESSAGE =
            "Estamos buscando la computadora del local en esta red. Puede tardar unos segundos."
        private const val NOT_FOUND_MESSAGE =
            "No encontramos el servidor. Revisá que la computadora esté encendida y conectada al mismo WiFi."
        private const val LOAD_FAILED_MESSAGE =
            "Perdimos la conexión con el servidor. Puede que la computadora esté apagada o haya cambiado de dirección."
        private const val MANUAL_MESSAGE =
            "Buscá automáticamente o escribí la dirección de la computadora del local."
        private const val INVALID_ADDRESS_MESSAGE =
            "La dirección no es válida. Usá un formato como 192.168.0.16."
        private const val ADDRESS_FAILED_MESSAGE =
            "No respondió ningún servidor en esa dirección. Revisá el número e intentá otra vez."
    }
}
