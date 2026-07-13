package expo.modules.aviationcallsign

internal enum class RecordingContainer {
  WAV,
  M4A,
  OPUS
}

internal enum class RecordingCodec {
  PCM_16,
  AAC_LC,
  OPUS
}

internal data class RecordingFormat(
  val container: RecordingContainer,
  val codec: RecordingCodec,
  val sampleRate: Int,
  val channelCount: Int,
  val bitRate: Int? = null,
  val extension: String
) {
  init {
    require(sampleRate > 0) { "Recording sample rate must be positive" }
    require(channelCount > 0) { "Recording channel count must be positive" }
  }

  companion object {
    fun debugWav(
      sampleRate: Int,
      channelCount: Int
    ): RecordingFormat = RecordingFormat(
      container = RecordingContainer.WAV,
      codec = RecordingCodec.PCM_16,
      sampleRate = sampleRate,
      channelCount = channelCount,
      extension = "wav"
    )

    fun productionAac(
      sampleRate: Int,
      channelCount: Int,
      bitRate: Int = 64_000
    ): RecordingFormat = RecordingFormat(
      container = RecordingContainer.M4A,
      codec = RecordingCodec.AAC_LC,
      sampleRate = sampleRate,
      channelCount = channelCount,
      bitRate = bitRate,
      extension = "m4a"
    )
  }
}
