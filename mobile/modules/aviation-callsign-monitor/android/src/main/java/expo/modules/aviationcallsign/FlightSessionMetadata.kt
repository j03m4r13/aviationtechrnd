package expo.modules.aviationcallsign

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

internal data class FlightCallsignEvent(
  val timeMs: Long,
  val source: String,
  val status: String,
  val target: String,
  val transcript: String,
  val normalized: String,
  val score: Double
) {
  fun toJson(): JSONObject = JSONObject()
    .put("timeMs", timeMs)
    .put("source", source)
    .put("status", status)
    .put("target", target)
    .put("transcript", transcript)
    .put("normalized", normalized)
    .put("score", score)
}

internal data class FlightSessionMetadata(
  val ownerUserId: String,
  val sessionId: String,
  val startedAtEpochMs: Long,
  val endedAtEpochMs: Long?,
  val recording: RecordingFileInfo?,
  val events: List<FlightCallsignEvent>
) {
  fun toJson(): JSONObject {
    val root = JSONObject()
      .put("ownerUserId", ownerUserId)
      .put("sessionId", sessionId)
      .put("startedAtEpochMs", startedAtEpochMs)
      .put("endedAtEpochMs", endedAtEpochMs)

    if (recording != null) {
      root.put(
        "recording",
        JSONObject()
          .put("file", recording.file.name)
          .put("container", recording.format.container.name.lowercase())
          .put("codec", recording.format.codec.name.lowercase())
          .put("sampleRate", recording.format.sampleRate)
          .put("channels", recording.format.channelCount)
          .put("bitRate", recording.format.bitRate)
          .put("durationMs", recording.durationMs)
          .put("audioBytes", recording.audioBytes)
      )
    }

    val eventArray = JSONArray()
    events.forEach { eventArray.put(it.toJson()) }
    root.put("events", eventArray)

    return root
  }

  fun writeTo(file: File) {
    file.parentFile?.mkdirs()
    file.writeText(toJson().toString(2), Charsets.UTF_8)
  }
}
