package expo.modules.aviationcallsign

import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import android.util.Log

internal object CallsignAlertTone {
  private const val logTag = "CallsignAlert"
  private val mainHandler = Handler(Looper.getMainLooper())

  fun play(confirmed: Boolean) {
    mainHandler.post {
      runCatching {
        val durationMs = if (confirmed) 160 else 240
        val toneType =
          if (confirmed) ToneGenerator.TONE_PROP_ACK else ToneGenerator.TONE_PROP_BEEP

        // STREAM_NOTIFICATION is commonly muted by notification/DND settings.
        // STREAM_MUSIC follows the media volume and is more reliable for an
        // in-app foreground alert.
        val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
        val started = tone.startTone(toneType, durationMs)
        Log.i(logTag, "Tone requested confirmed=$confirmed started=$started")
        mainHandler.postDelayed({ tone.release() }, durationMs.toLong() + 160L)
      }.onFailure { error ->
        Log.e(logTag, "Unable to play callsign tone", error)
      }
    }
  }
}
