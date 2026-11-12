package it.quivicino.distributori

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Sul telefono l'app mostra la web app pubblicata, così resta una sola interfaccia da mantenere.
 * Qui si chiede anche il permesso di posizione che serve ad Android Auto.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var voce: LetturaVocale
    private var giaConsentito = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.setGeolocationEnabled(true)
        // Testo al 100%, come nel browser: senza questo la WebView ingrandisce tutto
        // seguendo la dimensione dei caratteri scelta nelle impostazioni del telefono.
        web.settings.textZoom = 100
        // Lettura vocale: la WebView non ha speechSynthesis, la diamo noi con la voce del telefono.
        voce = LetturaVocale(this)
        web.addJavascriptInterface(voce, LetturaVocale.NOME)
        val scriptPrimaDellaPagina = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (scriptPrimaDellaPagina) {
            WebViewCompat.addDocumentStartJavaScript(web, LetturaVocale.SCRIPT, setOf("https://quivicino.github.io"))
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                callback.invoke(origin, true, false)
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                if (!scriptPrimaDellaPagina) view.evaluateJavascript(LetturaVocale.SCRIPT, null)
            }

            // I link esterni (navigatore, OpenStreetMap, guida…) si aprono fuori dall'app.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == INDIRIZZO.host && (url.path ?: "").startsWith("/Distributori")) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                } catch (e: ActivityNotFoundException) {
                    // nessuna app per aprirlo
                }
                return true
            }
        }
        setContentView(web)
        if (savedInstanceState == null) web.loadUrl(INDIRIZZO.toString()) else web.restoreState(savedInstanceState)

        giaConsentito = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!giaConsentito) {
            requestPermissions(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 1
            )
        }
    }

    // Al primo avvio la pagina parte prima del "Consenti" sulla posizione e trova il GPS bloccato:
    // appena il permesso arriva la ricarichiamo, così la web app trova subito dove sei.
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1 && grantResults.any { it == PackageManager.PERMISSION_GRANTED } && !giaConsentito) {
            web.reload()
        }
    }

    override fun onDestroy() {
        voce.chiudi()
        web.destroy()
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Gestione semplice del tasto Indietro")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    companion object {
        val INDIRIZZO: Uri = Uri.parse("https://quivicino.github.io/Distributori/")
    }
}
