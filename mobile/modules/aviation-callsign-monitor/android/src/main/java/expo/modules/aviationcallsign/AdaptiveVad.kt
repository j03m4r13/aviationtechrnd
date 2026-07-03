package expo.modules.aviationcallsign

import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

internal enum class VadEvent { SILENCE, START, SPEECH, END }

internal class AdaptiveVad(
  private val startFrames: Int = 3,
  private val endFrames: Int = 35,
  private val marginDb: Double = 10.0,
  private val minimumThresholdDb: Double = -46.0
) {
  private var noiseFloorDb = -58.0
  private var voiceFrames = 0
  private var silenceFrames = 0
  private var active = false

  fun process(samples: ShortArray, count: Int): VadEvent {
    if (count <= 0) return if (active) VadEvent.SPEECH else VadEvent.SILENCE

    var sumSquares = 0.0
    for (index in 0 until count) {
      val value = samples[index].toDouble() / Short.MAX_VALUE.toDouble()
      sumSquares += value * value
    }
    val rms = sqrt(sumSquares / count.toDouble()).coerceAtLeast(1e-9)
    val db = 20.0 * log10(rms)

    val threshold = max(minimumThresholdDb, noiseFloorDb + marginDb)
    val voiced = db >= threshold

    if (!active && !voiced) {
      noiseFloorDb = noiseFloorDb * 0.98 + db * 0.02
    }

    return if (!active) {
      if (voiced) voiceFrames++ else voiceFrames = 0
      if (voiceFrames >= startFrames) {
        active = true
        silenceFrames = 0
        VadEvent.START
      } else {
        VadEvent.SILENCE
      }
    } else {
      if (voiced) {
        silenceFrames = 0
        VadEvent.SPEECH
      } else {
        silenceFrames++
        if (silenceFrames >= endFrames) {
          active = false
          voiceFrames = 0
          silenceFrames = 0
          VadEvent.END
        } else {
          VadEvent.SPEECH
        }
      }
    }
  }

  fun reset() {
    voiceFrames = 0
    silenceFrames = 0
    active = false
  }
}
