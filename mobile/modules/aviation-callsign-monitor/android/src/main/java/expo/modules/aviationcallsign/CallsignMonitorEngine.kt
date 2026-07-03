package expo.modules.aviationcallsign

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.Closeable
import java.util.concurrent.atomic.AtomicBoolean

internal class CallsignMonitorEngine(
  private val context: Context,
  private val listener: Listener
) : Closeable {
  interface Listener {
    fun onStatus(payload: Map<String, Any?>)
    fun onTranscript(payload: Map<String, Any?>)
    fun onAlert(payload: Map<String, Any?>)
    fun onError(code: String, message: String)
  }

  private val sampleRate = 16_000
  private val frameSamples = 320
  private val maximumSegmentSamples = sampleRate * 12
  private val preRoll = ShortRingBuffer(sampleRate / 2)
  private val segment = ShortAccumulator(sampleRate * 4)
  private val vad = AdaptiveVad()
  private val running = AtomicBoolean(false)
  private val whisper = WhisperEngine()

  @Volatile private var initialized = false
  @Volatile private var audioThread: Thread? = null
  @Volatile private var audioRecord: AudioRecord? = null
  @Volatile private var voskModel: Model? = null
  @Volatile private var voskRecognizer: Recognizer? = null
  @Volatile private var matcher: CallsignMatcher? = null
  @Volatile private var aliases: List<String> = emptyList()
  @Volatile private var voskModelName: String? = null

  private var lastVoskMatchAt = 0L
  private var lastVoskScore = 0.0
  private var lastVoskTranscript = ""
  private var lastNotificationAt = 0L

  fun initialize(
    callsign: String,
    aliases: List<String>,
    voskAssetDirectory: String,
    whisperAssetFile: String
  ) {
    require(!running.get()) { "Stop monitoring before reinitializing" }
    this.aliases = aliases
    matcher = CallsignMatcher(callsign, aliases)

    listener.onStatus(status() + ("message" to "Installing offline models"))

    val voskDirectory = AssetInstaller.copyDirectory(
      context,
      voskAssetDirectory,
      voskAssetDirectory.substringAfterLast('/')
    )
    val whisperFile = AssetInstaller.copyFile(
      context,
      whisperAssetFile,
      whisperAssetFile.substringAfterLast('/')
    )

    voskModel = Model(voskDirectory.absolutePath)
    voskModelName = voskDirectory.name
    rebuildVoskRecognizer()
    whisper.load(whisperFile)

    initialized = true
    listener.onStatus(status() + ("message" to "Offline callsign monitor ready"))
  }

  @Synchronized
  fun setCallsign(callsign: String, aliases: List<String>) {
    require(!running.get()) { "Stop monitoring before changing the callsign" }
    this.aliases = aliases
    matcher?.update(callsign, aliases) ?: run {
      matcher = CallsignMatcher(callsign, aliases)
    }
    rebuildVoskRecognizer()
    listener.onStatus(status() + ("message" to "Callsign updated"))
  }

  @Synchronized
  private fun rebuildVoskRecognizer() {
    val model = voskModel ?: return
    val currentMatcher = matcher ?: return
    voskRecognizer?.close()
    voskRecognizer = Recognizer(
      model,
      sampleRate.toFloat(),
      CallsignNormalizer.grammar(currentMatcher.currentTarget(), aliases)
    ).apply {
      setWords(true)
      setPartialWords(true)
      setMaxAlternatives(2)
    }
  }

  fun start() {
    check(initialized) { "Initialize the monitor before starting" }
    if (!running.compareAndSet(false, true)) return

    if (
      ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      running.set(false)
      throw SecurityException("Microphone permission has not been granted")
    }

    val minimumBytes = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    check(minimumBytes > 0) {
      "This device does not support 16 kHz mono recording"
    }

    val recorder = AudioRecord.Builder()
      .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
          .build()
      )
      .setBufferSizeInBytes(maxOf(minimumBytes, frameSamples * 2 * 8))
      .build()

    check(recorder.state == AudioRecord.STATE_INITIALIZED) {
      "Unable to initialize microphone input"
    }
    audioRecord = recorder
    recorder.startRecording()

    audioThread = Thread(
      { captureLoop(recorder) },
      "aviation-callsign-audio"
    ).apply {
      priority = Thread.MAX_PRIORITY
      start()
    }
    listener.onStatus(status() + ("message" to "Listening for callsign"))
  }

  @Synchronized
  fun stop() {
    val wasRunning = running.getAndSet(false)
    val recorder = audioRecord

    runCatching {
      if (recorder?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        recorder.stop()
      }
    }

    val thread = audioThread
    if (thread != null && thread !== Thread.currentThread()) {
      runCatching { thread.join(1_500) }
    }

    audioThread = null
    audioRecord = null
    runCatching { recorder?.release() }
    vad.reset()
    preRoll.clear()
    segment.clear()

    if (wasRunning || recorder != null) {
      listener.onStatus(status() + ("message" to "Monitoring stopped"))
    }
  }

  private fun captureLoop(recorder: AudioRecord) {
    val frame = ShortArray(frameSamples)
    try {
      while (running.get()) {
        val count = recorder.read(
          frame,
          0,
          frame.size,
          AudioRecord.READ_BLOCKING
        )
        if (count <= 0) continue

        processVosk(frame, count)
        when (vad.process(frame, count)) {
          VadEvent.SILENCE -> preRoll.append(frame, count)
          VadEvent.START -> {
            segment.clear()
            segment.append(preRoll.snapshot())
            segment.append(frame, count)
            preRoll.clear()
          }
          VadEvent.SPEECH -> {
            if (segment.size > 0) segment.append(frame, count)
          }
          VadEvent.END -> finalizeSegment()
        }

        if (segment.size >= maximumSegmentSamples) finalizeSegment()
      }
    } catch (error: Throwable) {
      if (running.get()) {
        listener.onError(
          "AUDIO_CAPTURE_FAILED",
          error.message ?: error.javaClass.simpleName
        )
      }
    } finally {
      running.set(false)
      synchronized(this) {
        if (audioRecord === recorder) {
          audioRecord = null
          audioThread = null
        }
      }
      runCatching {
        if (recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
          recorder.stop()
        }
      }
      runCatching { recorder.release() }
      listener.onStatus(status() + ("message" to "Audio capture ended"))
    }
  }

  private fun processVosk(frame: ShortArray, count: Int) {
    val recognizer = voskRecognizer ?: return
    val finalized = recognizer.acceptWaveForm(frame, count)
    val json = if (finalized) recognizer.result else recognizer.partialResult
    val key = if (finalized) "text" else "partial"
    val text = runCatching {
      JSONObject(json).optString(key)
    }.getOrDefault("").trim()
    if (text.isBlank()) return

    evaluateTranscript(
      if (finalized) "VOSK_FINAL" else "VOSK_PARTIAL",
      text
    )
  }

  private fun finalizeSegment() {
    if (segment.size < sampleRate / 3) {
      segment.clear()
      return
    }

    val audio = segment.toArray()
    segment.clear()
    preRoll.clear()

    whisper.transcribeAsync(audio) { result ->
      result.onSuccess { text ->
        if (text.isNotBlank()) evaluateTranscript("WHISPER", text)
      }.onFailure { error ->
        listener.onError(
          "WHISPER_FAILED",
          error.message ?: error.javaClass.simpleName
        )
      }
    }
  }

  @Synchronized
  private fun evaluateTranscript(source: String, transcript: String) {
    val match = matcher?.score(transcript) ?: return
    val now = System.currentTimeMillis()

    listener.onTranscript(
      mapOf(
        "source" to source,
        "transcript" to transcript,
        "normalized" to match.normalizedTranscript,
        "score" to match.score,
        "timestamp" to now
      )
    )

    if (
      source.startsWith("VOSK") &&
        match.score >= 0.90 &&
        match.normalizedTranscript.length >= 4
    ) {
      lastVoskMatchAt = now
      lastVoskScore = match.score
      lastVoskTranscript = transcript
      emitAlert("VOSK", transcript, match, confirmed = false, now = now)
      return
    }

    if (
      source == "WHISPER" &&
        match.score >= 0.84 &&
        match.normalizedTranscript.length >= 4
    ) {
      val corroborated =
        now - lastVoskMatchAt <= 5_000 && lastVoskScore >= 0.75
      emitAlert(
        source = if (corroborated) "BOTH" else "WHISPER",
        transcript =
          if (corroborated && lastVoskTranscript.isNotBlank()) {
            "$lastVoskTranscript | $transcript"
          } else {
            transcript
          },
        match = match,
        confirmed = corroborated,
        now = now
      )
    }
  }

  private fun emitAlert(
    source: String,
    transcript: String,
    match: MatchResult,
    confirmed: Boolean,
    now: Long
  ) {
    val notify = now - lastNotificationAt >= 6_000
    if (notify) lastNotificationAt = now

    listener.onAlert(
      mapOf(
        "target" to (matcher?.currentTarget() ?: ""),
        "transcript" to transcript,
        "normalized" to match.normalizedTranscript,
        "source" to source,
        "score" to match.score,
        "confirmed" to confirmed,
        "notify" to notify,
        "timestamp" to now
      )
    )
  }

  fun status(): Map<String, Any?> = mapOf(
    "initialized" to initialized,
    "monitoring" to running.get(),
    "callsign" to (matcher?.currentTarget() ?: ""),
    "whisperModel" to whisper.loadedModelName(),
    "voskModel" to voskModelName
  )

  override fun close() {
    stop()
    voskRecognizer?.close()
    voskRecognizer = null
    voskModel?.close()
    voskModel = null
    whisper.close()
    initialized = false
  }

  companion object {
    fun emptyStatus(): Map<String, Any?> = mapOf(
      "initialized" to false,
      "monitoring" to false,
      "callsign" to "",
      "whisperModel" to null,
      "voskModel" to null
    )
  }
}
