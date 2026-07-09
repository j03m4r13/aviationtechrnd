package expo.modules.aviationcallsign

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AviationCallsignMonitorModule : Module() {
  private var engine: CallsignMonitorEngine? = null
  private var flightSession: FlightSessionEngine? = null

  override fun definition() = ModuleDefinition {
    Name("AviationCallsignMonitor")

    Events("onCallsignAlert", "onTranscript", "onStatus", "onError")

    AsyncFunction("initialize") {
      callsign: String,
      aliases: List<String>,
      voskAssetDirectory: String,
      whisperAssetFile: String ->

      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")

      val effectiveWhisperAssetFile =
        if (whisperAssetFile == "models/ggml-small.en-q5_1.bin") {
          "models/ggml-base.en-q5_1.bin"
        } else {
          whisperAssetFile
        }

      flightSession?.close()
      flightSession = null
      engine?.close()
      engine = CallsignMonitorEngine(context, object : CallsignMonitorEngine.Listener {
        override fun onStatus(payload: Map<String, Any?>) {
          sendEvent("onStatus", payload)
        }

        override fun onTranscript(payload: Map<String, Any?>) {
          sendEvent("onTranscript", payload)
        }

        override fun onAlert(payload: Map<String, Any?>) {
          flightSession?.recordCallsignAlert(payload)

          val source = payload["source"] as? String
          val confirmed =
            payload["confirmed"] as? Boolean == true ||
              source == "WHISPER" ||
              source == "BOTH"
          val shouldPlay = confirmed || payload["notify"] as? Boolean == true

          if (shouldPlay) {
            CallsignAlertTone.play(confirmed)
          }

          sendEvent("onCallsignAlert", payload)
        }

        override fun onError(code: String, message: String) {
          sendEvent("onError", mapOf("code" to code, "message" to message))
        }
      })

      engine!!.initialize(
        callsign,
        aliases,
        voskAssetDirectory,
        effectiveWhisperAssetFile
      )
      flightSession = FlightSessionEngine(context, engine!!)
      engine!!.status()
    }

    AsyncFunction("startMonitoring") {
      val current = engine ?: throw IllegalStateException("Initialize the monitor first")
      current.start()
      current.status()
    }

    AsyncFunction("stopMonitoring") {
      engine?.stop()
      engine?.status() ?: CallsignMonitorEngine.emptyStatus()
    }

    AsyncFunction("setCallsign") { callsign: String, aliases: List<String> ->
      val current = engine ?: throw IllegalStateException("Initialize the monitor first")
      current.setCallsign(callsign, aliases)
      current.status()
    }

    AsyncFunction("startFlightSession") { ownerUserId: String ->
      val currentSession = flightSession
        ?: throw IllegalStateException("Initialize the monitor first")
      currentSession.start(ownerUserId)
    }

    AsyncFunction("stopFlightSession") {
      flightSession?.stop() ?: emptyFlightSessionStatus()
    }

    AsyncFunction("getFlightSessionStatus") {
      flightSession?.status() ?: emptyFlightSessionStatus()
    }

    AsyncFunction("listFlightSessions") { ownerUserId: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")
      FlightSessionStore.listSessions(context, ownerUserId)
    }

    AsyncFunction("saveFlightSessionProcessingResult") {
      ownerUserId: String,
      sessionId: String,
      transcript: String,
      translation: String,
      sourceLanguage: String,
      targetLanguage: String,
      cloudSessionId: String,
      transcriptionModel: String,
      translationModel: String ->

      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")
      FlightSessionStore.saveProcessingResult(
        context = context,
        ownerUserId = ownerUserId,
        sessionId = sessionId,
        transcript = transcript,
        translation = translation,
        sourceLanguage = sourceLanguage,
        targetLanguage = targetLanguage,
        cloudSessionId = cloudSessionId,
        transcriptionModel = transcriptionModel,
        translationModel = translationModel
      )
    }

    AsyncFunction("shareFlightSessionFile") {
      ownerUserId: String,
      filePath: String,
      mimeType: String,
      title: String ->

      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")
      FlightSessionShare.shareFile(context, ownerUserId, filePath, mimeType, title)
    }

    AsyncFunction("testAlert") { confirmed: Boolean ->
      CallsignAlertTone.play(confirmed)
      mapOf(
        "success" to true,
        "confirmed" to confirmed
      )
    }

    AsyncFunction("getStatus") {
      engine?.status() ?: CallsignMonitorEngine.emptyStatus()
    }

    OnDestroy {
      flightSession?.close()
      flightSession = null
      engine?.close()
      engine = null
    }
  }

  private fun emptyFlightSessionStatus(): Map<String, Any?> = mapOf(
    "active" to false,
    "ownerUserId" to null,
    "sessionId" to null,
    "recordingFile" to null,
    "recordingContainer" to null,
    "recordingCodec" to null,
    "recordingSampleRate" to null,
    "recordingChannels" to null,
    "recordingDurationMs" to null,
    "recordingAudioBytes" to null,
    "metadataFile" to null,
    "eventCount" to 0,
    "message" to null
  )
}
