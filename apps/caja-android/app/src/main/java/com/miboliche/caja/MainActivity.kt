package com.miboliche.caja

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Shell de caja: WebView a pantalla completa + impresión USB nativa.
 * El servidor se descubre solo en la LAN (ServerFinder) — la IP no se hardcodea.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var printer: UsbEscPosPrinter
    private var overlay: View? = null
    private val main = Handler(Looper.getMainLooper())

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
                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    if (request.isForMainFrame) showSetup(SETUP_LOAD_FAILED)
                }
            }
            setOnLongClickListener {
                showSetup(null)
                true
            }
        }

        root = FrameLayout(this).apply {
            setBackgroundColor(BG)
            addView(webView, matchParent())
        }
        setContentView(root)

        val saved = savedServer()
        if (saved != null) {
            load(saved)
        } else {
            startDiscovery()
        }
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

    private fun load(base: String) {
        clearOverlay()
        webView.visibility = View.VISIBLE
        webView.loadUrl("${base.trimEnd('/')}/caja")
    }

    private fun startDiscovery() {
        showSearching()
        Thread {
            val found = ServerFinder.discover()
            main.post {
                if (found != null) {
                    saveServer(found)
                    load(found)
                } else {
                    showSetup(SETUP_NOT_FOUND)
                }
            }
        }.start()
    }

    private fun connectManually(input: String, status: TextView, button: Button) {
        var value = input.trim().trimEnd('/')
        if (value.isEmpty()) return
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "http://$value"
        }
        if (!value.substringAfterLast(':', "").matches(Regex("\\d+"))) {
            value = "$value:${ServerFinder.PORT}"
        }
        val target = value
        button.isEnabled = false
        status.visibility = View.VISIBLE
        status.text = "Probando la conexión…"
        Thread {
            val ok = ServerFinder.isServer(target)
            main.post {
                button.isEnabled = true
                if (ok) {
                    saveServer(target)
                    load(target)
                } else {
                    status.text = "No respondió nadie en esa dirección. Revisá el número."
                }
            }
        }.start()
    }

    // ---------- pantallas ----------

    private fun clearOverlay() {
        overlay?.let { root.removeView(it) }
        overlay = null
    }

    private fun showOverlay(view: View) {
        clearOverlay()
        overlay = view
        webView.visibility = View.GONE
        root.addView(view, matchParent())
    }

    private fun showSearching() {
        val box = column().apply {
            addView(title("Buscando la caja…"))
            addView(
                body("Estamos ubicando la computadora del local en la red. Tarda unos segundos.")
            )
            addView(
                ProgressBar(this@MainActivity).apply {
                    isIndeterminate = true
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ).apply { topMargin = dp(20) }
                },
            )
        }
        showOverlay(box)
    }

    private fun showSetup(message: String?) {
        val status = body("").apply {
            visibility = View.GONE
            setTextColor(WARN)
        }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            hint = "192.168.0.16"
            setHintTextColor(MUTED)
            setTextColor(Color.WHITE)
            setText(savedServer() ?: "")
            setSingleLine()
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(18) }
        }

        val connect = Button(this).apply {
            text = "Conectar"
            isAllCaps = false
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(14) }
        }
        connect.setOnClickListener { connectManually(input.text.toString(), status, connect) }

        val retry = Button(this).apply {
            text = "Buscar de nuevo"
            isAllCaps = false
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(8) }
            setOnClickListener { startDiscovery() }
        }

        val box = column().apply {
            addView(title("Conectar con la caja"))
            addView(
                body(
                    message
                        ?: "Escribí la dirección que aparece en Sistema, o volvé a buscar automáticamente.",
                ),
            )
            addView(input)
            addView(status)
            addView(connect)
            addView(retry)
        }
        showOverlay(box)
    }

    // ---------- helpers de UI ----------

    private fun column() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_VERTICAL
        setBackgroundColor(BG)
        val p = dp(28)
        setPadding(p, p, p, p)
    }

    private fun title(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
    }

    private fun body(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(MUTED)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(10) }
    }

    private fun matchParent() = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
    )

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

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
        private const val BG = 0xFF111315.toInt()
        private val MUTED = 0xFF9BA1A6.toInt()
        private val WARN = 0xFFFBBF24.toInt()
        private const val SETUP_NOT_FOUND =
            "No encontramos la caja en esta red. Verificá que la tablet esté en el mismo WiFi del local."
        private const val SETUP_LOAD_FAILED =
            "No pudimos abrir la caja. Puede que la computadora esté apagada o haya cambiado de dirección."
    }
}
