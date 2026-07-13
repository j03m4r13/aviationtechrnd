package expo.modules.aviationcallsign

import java.io.Closeable
import java.io.File

internal data class RecordingFileInfo(
  val sessionId: String,
  val file: File,
  val format: RecordingFormat,
  val startedAtNs: Long,
  val endedAtNs: Long?,
  val durationMs: Long,
  val audioBytes: Long,
  val frameCount: Long
)

internal interface FlightRecordingWriter : Closeable {
  val isRecording: Boolean
  val currentInfo: RecordingFileInfo?

  fun start(
    sessionId: String,
    outputDirectory: File,
    format: RecordingFormat
  ): RecordingFileInfo

  fun write(frame: AudioFrame)

  fun stop(): RecordingFileInfo?
}
