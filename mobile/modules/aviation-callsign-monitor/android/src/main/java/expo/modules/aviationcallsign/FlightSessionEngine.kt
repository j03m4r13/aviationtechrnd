package expo.modules.aviationcallsign

import android.content.Context
import java.io.Closeable
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal class FlightSessionEngine(
  private val context: Context,
  private val callsignConsumer: CallsignMonitorEngine
) : Closeable {
  private val audioEngine = FlightAudioEngine(context)
  private val events = mutableListOf<FlightCallsignEvent>()

  @Volatile private var active = false
  @Volatile private var ownerUserId: String? = null
  @Volatile private var sessionId: String? = null
  @Volatile private var startedAtEpochMs: Long = 0L
  @Volatile private var recordingInfo: RecordingFileInfo? = null
  @Volatile private var metadataFile: File? = null

  @Synchronized
  fun start(ownerUserId: String): Map<String, Any?> {
    check(!active) { "Flight session is already running" }
    require(ownerUserId.isNotBlank()) { "ownerUserId is required" }

    val newSessionId = createSessionId()
    val sessionDirectory = FlightSessionStore.sessionDirectory(
      context = context,
      ownerUserId = ownerUserId,
      sessionId = newSessionId
    )
    val writer = AacFlightRecordingWriter()
    val format = RecordingFormat.productionAac(
      sampleRate = 16_000,
      channelCount = 1,
      bitRate = 64_000
    )

    events.clear()
    this.ownerUserId = ownerUserId
    startedAtEpochMs = System.currentTimeMillis()
    sessionId = newSessionId
    metadataFile = File(sessionDirectory, "$newSessionId.json")

    audioEngine.addConsumer(callsignConsumer)
    recordingInfo = audioEngine.start(
      sessionId = newSessionId,
      recordingDirectory = sessionDirectory,
      recordingWriter = writer,
      recordingFormat = format
    )
    active = true

    return status("Flight session started")
  }

  @Synchronized
  fun stop(): Map<String, Any?> {
    if (!active) return status("No active flight session")

    val endedAtEpochMs = System.currentTimeMillis()
    val stoppedRecording = audioEngine.stop()
    audioEngine.removeConsumer(callsignConsumer)
    active = false
    recordingInfo = stoppedRecording ?: recordingInfo

    val metadata = FlightSessionMetadata(
      ownerUserId = ownerUserId.orEmpty(),
      sessionId = sessionId.orEmpty(),
      startedAtEpochMs = startedAtEpochMs,
      endedAtEpochMs = endedAtEpochMs,
      recording = recordingInfo,
      events = events.toList()
    )
    val targetMetadataFile = metadataFile
    if (targetMetadataFile != null) {
      metadata.writeTo(targetMetadataFile)
    }

    return status("Flight session stopped")
  }

  @Synchronized
  fun recordCallsignAlert(payload: Map<String, Any?>) {
    if (!active) return

    val source = payload["source"] as? String ?: "UNKNOWN"
    val confirmed =
      payload["confirmed"] as? Boolean == true || source == "WHISPER" || source == "BOTH"
    val score = (payload["score"] as? Number)?.toDouble() ?: 0.0
    val timeMs = (System.currentTimeMillis() - startedAtEpochMs).coerceAtLeast(0L)

    events += FlightCallsignEvent(
      timeMs = timeMs,
      source = source,
      status = if (confirmed) "CONFIRMED" else "POSSIBLE",
      target = payload["target"] as? String ?: "",
      transcript = payload["transcript"] as? String ?: "",
      normalized = payload["normalized"] as? String ?: "",
      score = score
    )
  }

  @Synchronized
  fun status(message: String? = null): Map<String, Any?> {
    val info = recordingInfo
    val metadata = metadataFile
    val currentSessionId = sessionId

    return mapOf(
      "active" to active,
      "ownerUserId" to ownerUserId,
      "sessionId" to currentSessionId,
      "recordingFile" to info?.file?.absolutePath,
      "recordingContainer" to info?.format?.container?.name?.lowercase(),
      "recordingCodec" to info?.format?.codec?.name?.lowercase(),
      "recordingSampleRate" to info?.format?.sampleRate,
      "recordingChannels" to info?.format?.channelCount,
      "recordingDurationMs" to info?.durationMs,
      "recordingAudioBytes" to info?.audioBytes,
      "metadataFile" to metadata?.absolutePath,
      "eventCount" to events.size,
      "message" to message
    )
  }

  override fun close() {
    runCatching { stop() }
    audioEngine.close()
  }

  private fun createSessionId(): String {
    val formatter = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).apply {
      timeZone = TimeZone.getDefault()
    }
    return "flight-${formatter.format(Date())}"
  }
}
