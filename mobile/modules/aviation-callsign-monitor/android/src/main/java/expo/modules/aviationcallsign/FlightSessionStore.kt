package expo.modules.aviationcallsign

import android.content.Context
import org.json.JSONObject
import java.io.File

internal object FlightSessionStore {
  private const val sessionsDirectoryName = "flight-sessions"

  fun sessionDirectory(context: Context, ownerUserId: String, sessionId: String): File =
    File(ownerDirectory(context, ownerUserId), sessionId)

  fun listSessions(context: Context, ownerUserId: String): List<Map<String, Any?>> {
    require(ownerUserId.isNotBlank()) { "ownerUserId is required" }

    val root = ownerDirectory(context, ownerUserId)
    if (!root.exists() || !root.isDirectory) return emptyList()

    return root
      .listFiles()
      .orEmpty()
      .filter { it.isDirectory }
      .mapNotNull { directory -> summarizeSessionDirectory(directory, ownerUserId) }
      .sortedByDescending { it["startedAtEpochMs"] as? Long ?: 0L }
  }

  fun saveProcessingResult(
    context: Context,
    ownerUserId: String,
    sessionId: String,
    transcript: String,
    translation: String,
    sourceLanguage: String,
    targetLanguage: String,
    cloudSessionId: String,
    transcriptionModel: String,
    translationModel: String
  ): Map<String, Any?> {
    require(ownerUserId.isNotBlank()) { "ownerUserId is required" }

    val directory = findSessionDirectory(context, ownerUserId, sessionId)
      ?: throw IllegalArgumentException("Flight session was not found for this user: $sessionId")

    val transcriptFile = File(directory, "$sessionId.transcript.json")
    val translationFile = File(directory, "$sessionId.translation.json")
    val now = System.currentTimeMillis()

    val transcriptJson = JSONObject()
      .put("ownerUserId", ownerUserId)
      .put("sessionId", sessionId)
      .put("createdAtEpochMs", now)
      .put("status", "completed")
      .put("sourceLanguage", sourceLanguage)
      .put("cloudSessionId", cloudSessionId)
      .put("model", transcriptionModel)
      .put("text", transcript)

    val translationJson = JSONObject()
      .put("ownerUserId", ownerUserId)
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

    return summarizeSessionDirectory(directory, ownerUserId)
      ?: throw IllegalStateException("Saved processing result, but session summary could not be read.")
  }

  fun isOwnedFile(context: Context, ownerUserId: String, filePath: String): Boolean {
    require(ownerUserId.isNotBlank()) { "ownerUserId is required" }
    val root = ownerDirectory(context, ownerUserId).canonicalFile
    val file = File(filePath).canonicalFile
    return file.path == root.path || file.path.startsWith(root.path + File.separator)
  }

  private fun ownerDirectory(context: Context, ownerUserId: String): File =
    File(File(context.filesDir, sessionsDirectoryName), safeOwnerSegment(ownerUserId))

  private fun safeOwnerSegment(ownerUserId: String): String =
    ownerUserId.replace(Regex("[^A-Za-z0-9._-]"), "_")

  private fun summarizeSessionDirectory(directory: File, ownerUserId: String): Map<String, Any?>? {
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

    val storedOwnerUserId = metadata.optString("ownerUserId", "")
    if (storedOwnerUserId != ownerUserId) return null

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
    val transcript = transcriptFile?.readOwnedJsonOrNull(ownerUserId)
    val translation = translationFile?.readOwnedJsonOrNull(ownerUserId)

    return mapOf(
      "ownerUserId" to ownerUserId,
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

  private fun findSessionDirectory(context: Context, ownerUserId: String, sessionId: String): File? {
    val root = ownerDirectory(context, ownerUserId)
    if (!root.exists() || !root.isDirectory) return null

    return root
      .listFiles()
      .orEmpty()
      .firstOrNull { directory ->
        directory.isDirectory && summarizeSessionDirectory(directory, ownerUserId)?.get("sessionId") == sessionId
      }
  }

  private fun File.readOwnedJsonOrNull(ownerUserId: String): JSONObject? = runCatching {
    val json = JSONObject(readText(Charsets.UTF_8))
    if (json.optString("ownerUserId", "") == ownerUserId) json else null
  }.getOrNull()

  private fun JSONObject.optLongOrNull(name: String): Long? =
    if (has(name) && !isNull(name)) optLong(name) else null

  private fun JSONObject.optIntOrNull(name: String): Int? =
    if (has(name) && !isNull(name)) optInt(name) else null
}
