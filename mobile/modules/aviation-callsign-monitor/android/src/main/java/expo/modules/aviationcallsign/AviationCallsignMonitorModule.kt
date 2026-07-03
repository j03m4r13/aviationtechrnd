package expo.modules.aviationcallsign

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AviationCallsignMonitorModule : Module() {
  private var engine: CallsignMonitorEngine? = null

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

      engine?.close()
      engine = CallsignMonitorEngine(context, object : CallsignMonitorEngine.Listener {
        override fun onStatus(payload: Map<String, Any?>) {
          sendEvent("onStatus", payload)
        }

        override fun onTranscript(payload: Map<String, Any?>) {
          sendEvent("onTranscript", payload)
        }

        override fun onAlert(payload: Map<String, Any?>) {
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

    AsyncFunction("getStatus") {
      engine?.status() ?: CallsignMonitorEngine.emptyStatus()
    }

    OnDestroy {
      engine?.close()
      engine = null
    }
  }
}
