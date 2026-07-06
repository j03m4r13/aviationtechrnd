package expo.modules.aviationcallsign

import android.content.Context
import org.json.JSONObject
import java.io.File

internal object FlightSessionStore {
  private const val sessionsDirectoryName = "flight-sessions"

  fun listSessions(context: Context): List<Map<String, Any?>> {
    val root = File(context.filesDir, sessionsDirectoryName)
    if (!root.exists() || !root.isDirectory) return emptyList()

    return root
      .listFiles()
      .orEmpty()
      .filter { it.isDirectory }
      .mapNotNull { directory -> summarizeSessionDirectory(directory) }
      .sortedByDescending { it["startedAtEpochMs"] as? Long ?: 0L }
  }

  private fun summarizeSessionDirectory(directory: File): Map<String, Any?>? {
    val metadataFile = directory
      .listFiles()
      .orEmpty()
      .firstOrNull { it.extension.equals("json", ignoreCase = true) }
      ?: return null

    val metadata = runCatching {
      JSONObject(metadataFile.readText(Charsets.UTF_8))
    }.getOrNull() ?: return null

    val sessionId = metadata.optString("sessionId", directory.name)
    val startedAtEpochMs = metadata.optLong("startedAtEpochMs", 0L)
    val endedAtEpochMs = metadata.optLongOrNull("endedAtEpochMs")
    val recording = metadata.optJSONObject("recording")
    val recordingFileName = recording?.optString("file")?.takeIf { it.isNotBlank() }
    val recordingFile = if (recordingFileName != null) {
      File(directory, recordingFileName)
    } else {
      directory
        .listFiles()
        .orEmpty()
        .firstOrNull { it.extension.equals("wav", ignoreCase = true) }
    }
    val events = metadata.optJSONArray("events")

    return mapOf(
      "sessionId" to sessionId,
      "startedAtEpochMs" to startedAtEpochMs,
      "endedAtEpochMs" to endedAtEpochMs,
      "recordingFile" to recordingFile?.absolutePath,
      "recordingExists" to (recordingFile?.exists() == true),
      "recordingContainer" to recording?.optString("container")?.takeIf { it.isNotBlank() },
      "recordingCodec" to recording?.optString("codec")?.takeIf { it.isNotBlank() },
      "recordingSampleRate" to recording?.optIntOrNull("sampleRate"),
      "recordingChannels" to recording?.optIntOrNull("channels"),
      "recordingDurationMs" to recording?.optLongOrNull("durationMs"),
      "recordingAudioBytes" to recording?.optLongOrNull("audioBytes"),
      "metadataFile" to metadataFile.absolutePath,
      "eventCount" to (events?.length() ?: 0)
    )
  }

  private fun JSONObject.optLongOrNull(name: String): Long? =
    if (has(name) && !isNull(name)) optLong(name) else null

  private fun JSONObject.optIntOrNull(name: String): Int? =
    if (has(name) && !isNull(name)) optInt(name) else null
}
