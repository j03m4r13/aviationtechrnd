package expo.modules.aviationcallsign

internal class WhisperNative private constructor() {
  companion object {
    init {
      System.loadLibrary("aviation_whisper")
    }

    @JvmStatic external fun nativeLoadModel(modelPath: String): Long
    @JvmStatic external fun nativeTranscribe(
      contextPointer: Long,
      audio: FloatArray,
      threads: Int
    ): String
    @JvmStatic external fun nativeFreeModel(contextPointer: Long)
  }
}
