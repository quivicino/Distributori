package it.quivicino.distributori

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import java.util.Locale

/**
 * La WebView di Android non ha la lettura vocale del browser (speechSynthesis), e la web app
 * per questo nasconde la voce "Lettura vocale". Qui la ricreiamo con la sintesi vocale del
 * telefono: [SCRIPT] definisce speechSynthesis nella pagina e la passa a questo oggetto.
 */
class LetturaVocale(context: Context) : TextToSpeech.OnInitListener {
    private val tts = TextToSpeech(context.applicationContext, this)
    private var pronta = false

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts.language = Locale.ITALY
            pronta = true
        }
    }

    @JavascriptInterface
    fun parla(testo: String, velocita: Float, volume: Float) {
        if (!pronta || testo.isBlank() || volume <= 0f) return
        tts.setSpeechRate(if (velocita > 0f) velocita else 1f)
        val parametri = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume.coerceIn(0f, 1f)) }
        tts.speak(testo, TextToSpeech.QUEUE_FLUSH, parametri, "qd")
    }

    @JavascriptInterface
    fun ferma() {
        if (pronta) tts.stop()
    }

    fun chiudi() = tts.shutdown()

    companion object {
        const val NOME = "QuiDistributoriVoce"

        /** Gira prima degli script della pagina, così la web app trova speechSynthesis. */
        val SCRIPT = """
            (function () {
              if (window.speechSynthesis || !window.$NOME) return;
              var ponte = window.$NOME;
              window.SpeechSynthesisUtterance = function (testo) {
                this.text = testo || ""; this.lang = "it-IT"; this.rate = 1; this.volume = 1; this.voice = null;
              };
              window.speechSynthesis = {
                speak: function (u) { ponte.parla(String(u.text || ""), Number(u.rate) || 1, u.volume == null ? 1 : Number(u.volume)); },
                cancel: function () { ponte.ferma(); },
                getVoices: function () { return []; },
                pause: function () {}, resume: function () {},
                speaking: false, pending: false, paused: false
              };
            })();
        """.trimIndent()
    }
}
