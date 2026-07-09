package expo.modules.aviationcallsign

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

internal object FlightSessionShare {
  fun shareFile(
    context: Context,
    ownerUserId: String,
    filePath: String,
    mimeType: String,
    title: String
  ): Map<String, Any?> {
    require(ownerUserId.isNotBlank()) { "ownerUserId is required" }

    if (!FlightSessionStore.isOwnedFile(context, ownerUserId, filePath)) {
      throw SecurityException("This file does not belong to the signed-in user.")
    }

    val file = File(filePath)
    if (!file.exists() || !file.isFile || file.length() <= 0L) {
      throw IllegalArgumentException("The export file was not found or is empty: $filePath")
    }

    val authority = "${context.packageName}.aviationcallsign.fileprovider"
    val uri = FileProvider.getUriForFile(context, authority, file)
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
      type = mimeType
      putExtra(Intent.EXTRA_STREAM, uri)
      putExtra(Intent.EXTRA_SUBJECT, title)
      putExtra(Intent.EXTRA_TITLE, title)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(sendIntent, title).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    context.startActivity(chooser)

    return mapOf(
      "success" to true,
      "filePath" to file.absolutePath,
      "mimeType" to mimeType,
      "title" to title
    )
  }
}
