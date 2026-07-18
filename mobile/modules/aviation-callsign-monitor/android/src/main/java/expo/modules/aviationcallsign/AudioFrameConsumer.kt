package expo.modules.aviationcallsign

internal interface AudioFrameConsumer {
  fun onAudioFrame(frame: AudioFrame)

  fun onAudioCaptureStarted(
    sampleRate: Int,
    channelCount: Int
  ) = Unit

  fun onAudioCaptureStopped() = Unit

  fun onAudioCaptureError(error: Throwable) = Unit
}
