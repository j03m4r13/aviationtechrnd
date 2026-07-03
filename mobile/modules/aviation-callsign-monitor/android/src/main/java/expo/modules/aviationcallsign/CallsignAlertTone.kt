package expo.modules.aviationcallsign

import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper

internal object CallsignAlertTone {
  private val mainHandler = Handler(Looper.getMainLooper())

  fun play(confirmed: Boolean) {
    mainHandler.post {
      val durationMs = if (confirmed) 140 else 220
      val toneType =
        if (confirmed) ToneGenerator.TONE_PROP_ACK else ToneGenerator.TONE_PROP_BEEP
      val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70)
      tone.startTone(toneType, durationMs)
      mainHandler.postDelayed({ tone.release() }, durationMs.toLong() + 120L)
    }
  }
}
