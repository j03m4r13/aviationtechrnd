package expo.modules.aviationcallsign

import android.util.Log
import java.io.Closeable
import java.io.File
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

internal class WhisperEngine : Closeable {
  private val executor = ThreadPoolExecutor(
    1,
    1,
    0L,
    TimeUnit.MILLISECONDS,
    ArrayBlockingQueue(1),
    { runnable ->
      Thread(runnable, "aviation-whisper").apply { priority = Thread.NORM_PRIORITY }
    },
    ThreadPoolExecutor.DiscardOldestPolicy()
  )

  @Volatile private var contextPointer: Long = 0L
  @Volatile private var modelName: String? = null

  fun load(modelFile: File) {
    check(contextPointer == 0L) { "Whisper model is already loaded" }
    val pointer = WhisperNative.nativeLoadModel(modelFile.absolutePath)
    check(pointer != 0L) { "Unable to load Whisper model: ${modelFile.absolutePath}" }
    contextPointer = pointer
    modelName = modelFile.name
  }

  fun loadedModelName(): String? = modelName

  fun transcribeAsync(samples: ShortArray, callback: (Result<String>) -> Unit) {
    if (executor.isShutdown) {
      callback(Result.failure(IllegalStateException("Whisper engine is closed")))
      return
    }

    executor.execute {
      val pointer = contextPointer
      if (pointer == 0L) {
        callback(Result.failure(IllegalStateException("Whisper model is not loaded")))
        return@execute
      }

      runCatching {
        val maximumSamples = 16_000 * 6
        val limitedSamples =
          if (samples.size > maximumSamples) samples.copyOf(maximumSamples) else samples

        Log.i(
          "AviationWhisper",
          "Preparing ${limitedSamples.size} samples (${limitedSamples.size * 1000 / 16_000} ms)"
        )

        val audio = FloatArray(limitedSamples.size) { index ->
          limitedSamples[index].toFloat() / Short.MAX_VALUE.toFloat()
        }

        WhisperNative.nativeTranscribe(pointer, audio, 4).trim()
      }.also(callback)
    }
  }

  override fun close() {
    val pointer = contextPointer
    contextPointer = 0L
    modelName = null

    executor.shutdown()
    if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
      executor.shutdownNow()
      executor.awaitTermination(5, TimeUnit.SECONDS)
    }

    if (pointer != 0L) {
      WhisperNative.nativeFreeModel(pointer)
    }
  }
}
