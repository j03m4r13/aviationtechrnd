package expo.modules.aviationcallsign

import android.content.Context
import java.io.File

internal object AssetInstaller {
  fun copyDirectory(context: Context, assetDirectory: String, destinationName: String): File {
    val destination = File(context.filesDir, "aviation_models/$destinationName")
    if (destination.exists() && destination.listFiles()?.isNotEmpty() == true) return destination

    destination.mkdirs()
    copyRecursive(context, assetDirectory.trim('/'), destination)
    return destination
  }

  fun copyFile(context: Context, assetPath: String, destinationName: String): File {
    val destination = File(context.filesDir, "aviation_models/$destinationName")
    if (destination.exists() && destination.length() > 0L) return destination

    destination.parentFile?.mkdirs()
    context.assets.open(assetPath).use { input ->
      destination.outputStream().use { output -> input.copyTo(output, DEFAULT_BUFFER_SIZE) }
    }
    return destination
  }

  private fun copyRecursive(context: Context, assetPath: String, destination: File) {
    val children = context.assets.list(assetPath).orEmpty()
    if (children.isEmpty()) {
      destination.parentFile?.mkdirs()
      context.assets.open(assetPath).use { input ->
        destination.outputStream().use { output -> input.copyTo(output, DEFAULT_BUFFER_SIZE) }
      }
      return
    }

    destination.mkdirs()
    for (child in children) {
      copyRecursive(context, "$assetPath/$child", File(destination, child))
    }
  }
}
