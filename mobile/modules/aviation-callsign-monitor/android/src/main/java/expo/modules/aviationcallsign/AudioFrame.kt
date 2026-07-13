package expo.modules.aviationcallsign

internal data class AudioFrame(
  val samples: ShortArray,
  val sampleRate: Int,
  val channelCount: Int,
  val timestampNs: Long,
  val frameIndex: Long
) {
  val sampleCount: Int
    get() = samples.size

  val durationMs: Int
    get() = if (sampleRate > 0 && channelCount > 0) {
      (sampleCount * 1_000L / sampleRate / channelCount).toInt()
    } else {
      0
    }

  fun copySamples(): ShortArray = samples.copyOf()
}
