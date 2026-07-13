package expo.modules.aviationcallsign

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import androidx.core.content.ContextCompat
import java.io.Closeable
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

internal class FlightAudioEngine(
  private val context: Context,
  private val sampleRate: Int = 16_000,
  private val channelCount: Int = 1,
  private val audioSource: Int = defaultAudioSource()
) : Closeable {
  private val running = AtomicBoolean(false)
  private val consumers = CopyOnWriteArrayList<AudioFrameConsumer>()

  @Volatile private var recorder: AudioRecord? = null
  @Volatile private var captureThread: Thread? = null
  @Volatile private var writer: FlightRecordingWriter? = null

  fun addConsumer(consumer: AudioFrameConsumer) {
    consumers += consumer
  }

  fun removeConsumer(consumer: AudioFrameConsumer) {
    consumers -= consumer
  }

  fun start(
    sessionId: String,
    recordingDirectory: File? = null,
    recordingWriter: FlightRecordingWriter? = null,
    recordingFormat: RecordingFormat = RecordingFormat.debugWav(sampleRate, channelCount)
  ): RecordingFileInfo? {
    check(!running.get()) { "Flight audio capture is already running" }

    if (
      ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      throw SecurityException("Microphone permission has not been granted")
    }

    val channelMask = when (channelCount) {
      1 -> AudioFormat.CHANNEL_IN_MONO
      2 -> AudioFormat.CHANNEL_IN_STEREO
      else -> throw IllegalArgumentException("Unsupported channel count: $channelCount")
    }

    val minimumBytes = AudioRecord.getMinBufferSize(
      sampleRate,
      channelMask,
      AudioFormat.ENCODING_PCM_16BIT
    )
    check(minimumBytes > 0) {
      "This device does not support ${sampleRate} Hz, $channelCount channel recording"
    }

    val frameSamples = sampleRate / 50 * channelCount // 20 ms frames
    val newRecorder = createFlightAudioRecord(channelMask, minimumBytes, frameSamples)

    val recordingInfo = if (recordingWriter != null && recordingDirectory != null) {
      recordingWriter.start(sessionId, recordingDirectory, recordingFormat)
    } else {
      null
    }

    writer = recordingWriter
    recorder = newRecorder
    running.set(true)
    newRecorder.startRecording()

    captureThread = Thread(
      { captureLoop(newRecorder, frameSamples) },
      "aviation-flight-audio"
    ).apply {
      priority = Thread.MAX_PRIORITY
      start()
    }

    consumers.forEach { consumer ->
      runCatching { consumer.onAudioCaptureStarted(sampleRate, channelCount) }
    }

    return recordingInfo
  }

  fun stop(): RecordingFileInfo? {
    running.set(false)

    val currentRecorder = recorder
    runCatching {
      if (currentRecorder?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        currentRecorder.stop()
      }
    }

    val currentThread = captureThread
    if (currentThread != null && currentThread !== Thread.currentThread()) {
      runCatching { currentThread.join(1_500) }
    }

    captureThread = null
    recorder = null
    runCatching { currentRecorder?.release() }

    consumers.forEach { consumer ->
      runCatching { consumer.onAudioCaptureStopped() }
    }

    val info = writer?.stop()
    writer = null
    return info
  }

  private fun createFlightAudioRecord(
    channelMask: Int,
    minimumBytes: Int,
    frameSamples: Int
  ): AudioRecord {
    var lastError: Throwable? = null

    for (source in audioSourceCandidates(audioSource)) {
      val candidate = runCatching {
        AudioRecord.Builder()
          .setAudioSource(source)
          .setAudioFormat(
            AudioFormat.Builder()
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setSampleRate(sampleRate)
              .setChannelMask(channelMask)
              .build()
          )
          .setBufferSizeInBytes(maxOf(minimumBytes, frameSamples * 2 * 8))
          .build()
      }.onFailure { lastError = it }.getOrNull()

      if (candidate?.state == AudioRecord.STATE_INITIALIZED) {
        return candidate
      }

      runCatching { candidate?.release() }
    }

    throw IllegalStateException("Unable to initialize flight audio input", lastError)
  }

  private fun captureLoop(
    activeRecorder: AudioRecord,
    frameSamples: Int
  ) {
    val buffer = ShortArray(frameSamples)
    var frameIndex = 0L

    try {
      while (running.get()) {
        val count = activeRecorder.read(
          buffer,
          0,
          buffer.size,
          AudioRecord.READ_BLOCKING
        )
        if (count <= 0) continue

        val frame = AudioFrame(
          samples = buffer.copyOf(count),
          sampleRate = sampleRate,
          channelCount = channelCount,
          timestampNs = System.nanoTime(),
          frameIndex = frameIndex++
        )

        writer?.write(frame)
        consumers.forEach { consumer ->
          runCatching { consumer.onAudioFrame(frame) }
            .onFailure { consumer.onAudioCaptureError(it) }
        }
      }
    } catch (error: Throwable) {
      consumers.forEach { consumer ->
        runCatching { consumer.onAudioCaptureError(error) }
      }
    } finally {
      running.set(false)
      if (recorder === activeRecorder) {
        recorder = null
      }
      runCatching {
        if (activeRecorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
          activeRecorder.stop()
        }
      }
      runCatching { activeRecorder.release() }
    }
  }

  override fun close() {
    stop()
    consumers.clear()
  }

  companion object {
    private fun defaultAudioSource(): Int =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        MediaRecorder.AudioSource.UNPROCESSED
      } else {
        MediaRecorder.AudioSource.VOICE_RECOGNITION
      }

    private fun audioSourceCandidates(preferred: Int): List<Int> {
      val candidates = mutableListOf<Int>()
      fun addCandidate(source: Int) {
        if (!candidates.contains(source)) candidates += source
      }

      addCandidate(preferred)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        addCandidate(MediaRecorder.AudioSource.UNPROCESSED)
      }
      addCandidate(MediaRecorder.AudioSource.VOICE_RECOGNITION)
      addCandidate(MediaRecorder.AudioSource.MIC)
      return candidates
    }
  }
}
