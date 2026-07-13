package expo.modules.aviationcallsign

import java.io.File
import java.io.RandomAccessFile
import kotlin.math.max

internal class WavFlightRecordingWriter : FlightRecordingWriter {
  private var sessionId: String? = null
  private var file: File? = null
  private var output: RandomAccessFile? = null
  private var format: RecordingFormat? = null
  private var startedAtNs: Long = 0L
  private var endedAtNs: Long? = null
  private var audioBytes: Long = 0L
  private var frameCount: Long = 0L

  override val isRecording: Boolean
    get() = output != null

  override val currentInfo: RecordingFileInfo?
    get() = buildInfo(endedAtNs)

  override fun start(
    sessionId: String,
    outputDirectory: File,
    format: RecordingFormat
  ): RecordingFileInfo {
    require(!isRecording) { "WAV recording is already active" }
    require(format.container == RecordingContainer.WAV) { "WavFlightRecordingWriter requires WAV format" }
    require(format.codec == RecordingCodec.PCM_16) { "WAV writer currently supports PCM_16 only" }

    outputDirectory.mkdirs()
    require(outputDirectory.exists() && outputDirectory.isDirectory) {
      "Unable to create recording directory: ${outputDirectory.absolutePath}"
    }

    val safeSessionId = sessionId.replace(Regex("[^A-Za-z0-9._-]"), "_")
    val targetFile = File(outputDirectory, "$safeSessionId.${format.extension}")
    val raf = RandomAccessFile(targetFile, "rw")
    raf.setLength(0)
    writePlaceholderHeader(raf, format)

    this.sessionId = safeSessionId
    this.file = targetFile
    this.output = raf
    this.format = format
    this.startedAtNs = System.nanoTime()
    this.endedAtNs = null
    this.audioBytes = 0L
    this.frameCount = 0L

    return requireNotNull(currentInfo)
  }

  override fun write(frame: AudioFrame) {
    val raf = output ?: return
    val currentFormat = format ?: return

    require(frame.sampleRate == currentFormat.sampleRate) {
      "Frame sample rate ${frame.sampleRate} does not match recording sample rate ${currentFormat.sampleRate}"
    }
    require(frame.channelCount == currentFormat.channelCount) {
      "Frame channel count ${frame.channelCount} does not match recording channel count ${currentFormat.channelCount}"
    }

    val bytes = ByteArray(frame.samples.size * 2)
    var byteIndex = 0
    for (sample in frame.samples) {
      val value = sample.toInt()
      bytes[byteIndex++] = (value and 0xff).toByte()
      bytes[byteIndex++] = ((value ushr 8) and 0xff).toByte()
    }

    raf.write(bytes)
    audioBytes += bytes.size.toLong()
    frameCount++
  }

  override fun stop(): RecordingFileInfo? {
    val raf = output ?: return currentInfo
    val currentFormat = format ?: return currentInfo

    endedAtNs = System.nanoTime()
    updateHeader(raf, currentFormat, audioBytes)
    raf.close()
    output = null

    return requireNotNull(currentInfo)
  }

  override fun close() {
    runCatching { stop() }
  }

  private fun buildInfo(endNs: Long?): RecordingFileInfo? {
    val currentSessionId = sessionId ?: return null
    val currentFile = file ?: return null
    val currentFormat = format ?: return null
    val effectiveEndNs = endNs ?: System.nanoTime()
    val durationMs = max(0L, (effectiveEndNs - startedAtNs) / 1_000_000L)

    return RecordingFileInfo(
      sessionId = currentSessionId,
      file = currentFile,
      format = currentFormat,
      startedAtNs = startedAtNs,
      endedAtNs = endNs,
      durationMs = durationMs,
      audioBytes = audioBytes,
      frameCount = frameCount
    )
  }

  private fun writePlaceholderHeader(
    raf: RandomAccessFile,
    format: RecordingFormat
  ) {
    writeHeader(raf, format, dataBytes = 0L)
  }

  private fun updateHeader(
    raf: RandomAccessFile,
    format: RecordingFormat,
    dataBytes: Long
  ) {
    val currentPosition = raf.filePointer
    raf.seek(0)
    writeHeader(raf, format, dataBytes)
    raf.seek(currentPosition)
  }

  private fun writeHeader(
    raf: RandomAccessFile,
    format: RecordingFormat,
    dataBytes: Long
  ) {
    val bitsPerSample = 16
    val blockAlign = format.channelCount * bitsPerSample / 8
    val byteRate = format.sampleRate * blockAlign
    val riffSize = 36L + dataBytes

    raf.writeAscii("RIFF")
    raf.writeIntLe(riffSize.coerceAtMost(UInt.MAX_VALUE.toLong()).toInt())
    raf.writeAscii("WAVE")
    raf.writeAscii("fmt ")
    raf.writeIntLe(16)
    raf.writeShortLe(1) // PCM
    raf.writeShortLe(format.channelCount)
    raf.writeIntLe(format.sampleRate)
    raf.writeIntLe(byteRate)
    raf.writeShortLe(blockAlign)
    raf.writeShortLe(bitsPerSample)
    raf.writeAscii("data")
    raf.writeIntLe(dataBytes.coerceAtMost(UInt.MAX_VALUE.toLong()).toInt())
  }

  private fun RandomAccessFile.writeAscii(value: String) {
    write(value.toByteArray(Charsets.US_ASCII))
  }

  private fun RandomAccessFile.writeShortLe(value: Int) {
    write(value and 0xff)
    write((value ushr 8) and 0xff)
  }

  private fun RandomAccessFile.writeIntLe(value: Int) {
    write(value and 0xff)
    write((value ushr 8) and 0xff)
    write((value ushr 16) and 0xff)
    write((value ushr 24) and 0xff)
  }
}
