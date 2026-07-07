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

  fun saveProcessingResult(
    context: Context,
    sessionId: String,
    transcript: String,
    translation: String,
    sourceLanguage: String,
    targetLanguage: String,
    cloudSessionId: String,
    transcriptionModel: String,
    translationModel: String
  ): Map<String, Any?> {
    val directory = findSessionDirectory(context, sessionId)
      ?: throw IllegalArgumentException("Flight session was not found: $sessionId")

    val transcriptFile = File(directory, "$sessionId.transcript.json")
    val translationFile = File(directory, "$sessionId.translation.json")
    val now = System.currentTimeMillis()

    val transcriptJson = JSONObject()
      .put("sessionId", sessionId)
      .put("createdAtEpochMs", now)
      .put("status", "completed")
      .put("sourceLanguage", sourceLanguage)
      .put("cloudSessionId", cloudSessionId)
      .put("model", transcriptionModel)
      .put("text", transcript)

    val translationJson = JSONObject()
      .put("sessionId", sessionId)
      .put("createdAtEpochMs", now)
      .put("status", "completed")
      .put("sourceLanguage", sourceLanguage)
      .put("targetLanguage", targetLanguage)
      .put("cloudSessionId", cloudSessionId)
      .put("model", translationModel)
      .put("text", translation)

    transcriptFile.writeText(transcriptJson.toString(2), Charsets.UTF_8)
    translationFile.writeText(translationJson.toString(2), Charsets.UTF_8)

    return summarizeSessionDirectory(directory)
      ?: throw IllegalStateException("Saved processing result, but session summary could not be read.")
  }

  private fun summarizeSessionDirectory(directory: File): Map<String, Any?>? {
    val metadataFile = directory
      .listFiles()
      .orEmpty()
      .firstOrNull {
        it.extension.equals("json", ignoreCase = true) &&
          !it.name.endsWith(".transcript.json", ignoreCase = true) &&
          !it.name.endsWith(".translation.json", ignoreCase = true)
      }
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
    val transcriptFile = File(directory, "$sessionId.transcript.json")
      .takeIf { it.exists() }
    val translationFile = File(directory, "$sessionId.translation.json")
      .takeIf { it.exists() }
    val transcript = transcriptFile?.readJsonOrNull()
    val translation = translationFile?.readJsonOrNull()

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
      "eventCount" to (events?.length() ?: 0),
      "transcriptStatus" to (transcript?.optString("status") ?: "not_processed"),
      "transcriptFile" to transcriptFile?.absolutePath,
      "transcriptText" to transcript?.optString("text")?.takeIf { it.isNotBlank() },
      "transcriptionModel" to transcript?.optString("model")?.takeIf { it.isNotBlank() },
      "translationStatus" to (translation?.optString("status") ?: "waiting_for_transcript"),
      "translationFile" to translationFile?.absolutePath,
      "translationText" to translation?.optString("text")?.takeIf { it.isNotBlank() },
      "translationModel" to translation?.optString("model")?.takeIf { it.isNotBlank() },
      "translationTargetLanguage" to translation?.optString("targetLanguage")?.takeIf { it.isNotBlank() },
      "cloudSessionId" to (
        transcript?.optString("cloudSessionId")?.takeIf { it.isNotBlank() }
          ?: translation?.optString("cloudSessionId")?.takeIf { it.isNotBlank() }
      )
    )
  }

  private fun findSessionDirectory(context: Context, sessionId: String): File? {
    val root = File(context.filesDir, sessionsDirectoryName)
    if (!root.exists() || !root.isDirectory) return null

    return root
      .listFiles()
      .orEmpty()
      .firstOrNull { it.isDirectory && it.name == sessionId }
      ?: root
        .listFiles()
        .orEmpty()
        .firstOrNull { directory ->
          directory.isDirectory && summarizeSessionDirectory(directory)?.get("sessionId") == sessionId
        }
  }

  private fun File.readJsonOrNull(): JSONObject? = runCatching {
    JSONObject(readText(Charsets.UTF_8))
  }.getOrNull()

  private fun JSONObject.optLongOrNull(name: String): Long? =
    if (has(name) && !isNull(name)) optLong(name) else null

  private fun JSONObject.optIntOrNull(name: String): Int? =
    if (has(name) && !isNull(name)) optInt(name) else null
}
