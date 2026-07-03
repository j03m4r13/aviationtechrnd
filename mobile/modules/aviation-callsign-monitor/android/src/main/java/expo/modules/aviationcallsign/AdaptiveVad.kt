package expo.modules.aviationcallsign

import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

internal enum class VadEvent { SILENCE, START, SPEECH, END }

internal class AdaptiveVad(
  private val startFrames: Int = 2,
  private val endFrames: Int = 25,
  private val marginDb: Double = 6.0,
  private val minimumThresholdDb: Double = -58.0,
  private val calibrationFrames: Int = 25
) {
  private var noiseFloorDb = -62.0
  private var calibrationCount = 0
  private var voiceFrames = 0
  private var silenceFrames = 0
  private var active = false

  fun process(samples: ShortArray, count: Int): VadEvent {
    if (count <= 0) return if (active) VadEvent.SPEECH else VadEvent.SILENCE

    var sumSquares = 0.0
    var peak = 0.0
    for (index in 0 until count) {
      val value = samples[index].toDouble() / Short.MAX_VALUE.toDouble()
      val magnitude = abs(value)
      sumSquares += value * value
      if (magnitude > peak) peak = magnitude
    }

    val rms = sqrt(sumSquares / count.toDouble()).coerceAtLeast(1e-9)
    val rmsDb = 20.0 * log10(rms)
    val peakDb = 20.0 * log10(peak.coerceAtLeast(1e-9))

    if (!active && calibrationCount < calibrationFrames) {
      noiseFloorDb = if (calibrationCount == 0) {
        rmsDb
      } else {
        noiseFloorDb * 0.85 + rmsDb * 0.15
      }
      calibrationCount++
      return VadEvent.SILENCE
    }

    val threshold = max(minimumThresholdDb, noiseFloorDb + marginDb)
    val voiced = rmsDb >= threshold || peakDb >= threshold + 8.0

    if (!active && !voiced) {
      noiseFloorDb = noiseFloorDb * 0.95 + rmsDb * 0.05
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
    noiseFloorDb = -62.0
    calibrationCount = 0
    voiceFrames = 0
    silenceFrames = 0
    active = false
  }
}
