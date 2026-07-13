package expo.modules.aviationcallsign

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.min

internal class AacFlightRecordingWriter : FlightRecordingWriter {
  private var sessionId: String? = null
  private var file: File? = null
  private var format: RecordingFormat? = null
  private var encoder: MediaCodec? = null
  private var muxer: MediaMuxer? = null
  private var bufferInfo: MediaCodec.BufferInfo? = null
  private var trackIndex = -1
  private var muxerStarted = false
  private var startedAtNs: Long = 0L
  private var endedAtNs: Long? = null
  private var inputSampleCount: Long = 0L
  private var encodedBytes: Long = 0L
  private var frameCount: Long = 0L
  private var eosQueued = false

  override val isRecording: Boolean
    get() = encoder != null

  override val currentInfo: RecordingFileInfo?
    get() = buildInfo(endedAtNs)

  override fun start(
    sessionId: String,
    outputDirectory: File,
    format: RecordingFormat
  ): RecordingFileInfo {
    require(!isRecording) { "AAC recording is already active" }
    require(format.container == RecordingContainer.M4A) { "AacFlightRecordingWriter requires M4A format" }
    require(format.codec == RecordingCodec.AAC_LC) { "AAC writer supports AAC_LC only" }

    outputDirectory.mkdirs()
    require(outputDirectory.exists() && outputDirectory.isDirectory) {
      "Unable to create recording directory: ${outputDirectory.absolutePath}"
    }

    val safeSessionId = sessionId.replace(Regex("[^A-Za-z0-9._-]"), "_")
    val targetFile = File(outputDirectory, "$safeSessionId.${format.extension}")
    if (targetFile.exists()) {
      targetFile.delete()
    }

    val audioFormat = MediaFormat.createAudioFormat(
      MediaFormat.MIMETYPE_AUDIO_AAC,
      format.sampleRate,
      format.channelCount
    ).apply {
      setInteger(
        MediaFormat.KEY_AAC_PROFILE,
        MediaCodecInfo.CodecProfileLevel.AACObjectLC
      )
      setInteger(MediaFormat.KEY_BIT_RATE, format.bitRate ?: 64_000)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16 * 1024)
    }

    val newEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    val newMuxer = MediaMuxer(
      targetFile.absolutePath,
      MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
    )

    newEncoder.configure(
      audioFormat,
      null,
      null,
      MediaCodec.CONFIGURE_FLAG_ENCODE
    )
    newEncoder.start()

    this.sessionId = safeSessionId
    this.file = targetFile
    this.format = format
    this.encoder = newEncoder
    this.muxer = newMuxer
    this.bufferInfo = MediaCodec.BufferInfo()
    this.trackIndex = -1
    this.muxerStarted = false
    this.startedAtNs = System.nanoTime()
    this.endedAtNs = null
    this.inputSampleCount = 0L
    this.encodedBytes = 0L
    this.frameCount = 0L
    this.eosQueued = false

    return requireNotNull(currentInfo)
  }

  override fun write(frame: AudioFrame) {
    val codec = encoder ?: return
    val currentFormat = format ?: return

    require(frame.sampleRate == currentFormat.sampleRate) {
      "Frame sample rate ${frame.sampleRate} does not match recording sample rate ${currentFormat.sampleRate}"
    }
    require(frame.channelCount == currentFormat.channelCount) {
      "Frame channel count ${frame.channelCount} does not match recording channel count ${currentFormat.channelCount}"
    }

    var sampleOffset = 0
    while (sampleOffset < frame.samples.size) {
      drainEncoder(endOfStream = false)

      val inputIndex = codec.dequeueInputBuffer(5_000)
      if (inputIndex < 0) {
        Thread.yield()
        continue
      }

      val inputBuffer = codec.getInputBuffer(inputIndex) ?: continue
      inputBuffer.clear()
      val writableSamples = min(inputBuffer.remaining() / 2, frame.samples.size - sampleOffset)
      val presentationTimeUs = presentationTimeUs(currentFormat)
      writePcm16(inputBuffer, frame.samples, sampleOffset, writableSamples)

      codec.queueInputBuffer(
        inputIndex,
        0,
        writableSamples * 2,
        presentationTimeUs,
        0
      )
      inputSampleCount += writableSamples.toLong()
      sampleOffset += writableSamples
    }

    frameCount++
    drainEncoder(endOfStream = false)
  }

  override fun stop(): RecordingFileInfo? {
    if (encoder == null) return currentInfo

    endedAtNs = System.nanoTime()
    queueEndOfStream()
    drainEncoder(endOfStream = true)

    val codec = encoder
    val activeMuxer = muxer

    encoder = null
    muxer = null
    bufferInfo = null

    runCatching { codec?.stop() }
    runCatching { codec?.release() }
    runCatching {
      if (muxerStarted) {
        activeMuxer?.stop()
      }
    }
    runCatching { activeMuxer?.release() }

    muxerStarted = false
    trackIndex = -1
    file?.let { encodedBytes = it.length() }

    return requireNotNull(currentInfo)
  }

  override fun close() {
    runCatching { stop() }
  }

  private fun queueEndOfStream() {
    if (eosQueued) return
    val codec = encoder ?: return
    val currentFormat = format ?: return

    while (true) {
      val inputIndex = codec.dequeueInputBuffer(10_000)
      if (inputIndex >= 0) {
        codec.queueInputBuffer(
          inputIndex,
          0,
          0,
          presentationTimeUs(currentFormat),
          MediaCodec.BUFFER_FLAG_END_OF_STREAM
        )
        eosQueued = true
        return
      }
      drainEncoder(endOfStream = false)
    }
  }

  private fun drainEncoder(endOfStream: Boolean) {
    val codec = encoder ?: return
    val activeBufferInfo = bufferInfo ?: return

    while (true) {
      val outputIndex = codec.dequeueOutputBuffer(
        activeBufferInfo,
        if (endOfStream) 10_000 else 0
      )

      when {
        outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
          if (!endOfStream) return
        }

        outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          require(!muxerStarted) { "AAC output format changed after muxer start" }
          val activeMuxer = muxer ?: return
          trackIndex = activeMuxer.addTrack(codec.outputFormat)
          activeMuxer.start()
          muxerStarted = true
        }

        outputIndex >= 0 -> {
          val outputBuffer = codec.getOutputBuffer(outputIndex)
          if (outputBuffer != null && activeBufferInfo.size > 0) {
            if ((activeBufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
              require(muxerStarted) { "Muxer has not started" }
              outputBuffer.position(activeBufferInfo.offset)
              outputBuffer.limit(activeBufferInfo.offset + activeBufferInfo.size)
              muxer?.writeSampleData(trackIndex, outputBuffer, activeBufferInfo)
              encodedBytes += activeBufferInfo.size.toLong()
            }
          }

          codec.releaseOutputBuffer(outputIndex, false)

          if ((activeBufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
            return
          }
        }
      }
    }
  }

  private fun writePcm16(
    buffer: ByteBuffer,
    samples: ShortArray,
    offset: Int,
    count: Int
  ) {
    for (index in offset until offset + count) {
      val value = samples[index].toInt()
      buffer.put((value and 0xff).toByte())
      buffer.put(((value ushr 8) and 0xff).toByte())
    }
  }

  private fun presentationTimeUs(format: RecordingFormat): Long {
    val sampleFrames = inputSampleCount / format.channelCount
    return sampleFrames * 1_000_000L / format.sampleRate
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
      audioBytes = if (endNs == null) encodedBytes else currentFile.length(),
      frameCount = frameCount
    )
  }
}
