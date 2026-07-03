package expo.modules.aviationcallsign

internal data class MatchResult(
  val score: Double,
  val normalizedTranscript: String,
  val matchedTarget: String
)

internal class CallsignMatcher(callsign: String, aliases: List<String>) {
  @Volatile private var target = ""
  @Volatile private var acceptedTargets: List<String> = emptyList()

  init {
    update(callsign, aliases)
  }

  fun update(callsign: String, aliases: List<String>) {
    target = CallsignNormalizer.normalizeTarget(callsign)
    require(target.length >= 3) { "Callsign must contain at least three letters or digits" }

    val variants = linkedSetOf(target)
    for (length in 3 until target.length) {
      variants += target.takeLast(length)
    }
    for (alias in aliases) {
      val normalized = CallsignNormalizer.normalizeTranscript(alias)
      if (normalized.length >= 3) variants += normalized
    }
    acceptedTargets = variants.sortedByDescending(String::length)
  }

  fun currentTarget(): String = target

  fun score(transcript: String): MatchResult {
    val normalized = CallsignNormalizer.normalizeTranscript(transcript)
    if (normalized.isBlank()) return MatchResult(0.0, normalized, target)

    var bestScore = 0.0
    var bestTarget = target
    for (candidate in acceptedTargets) {
      val score = bestWindowScore(normalized, candidate)
      if (score > bestScore) {
        bestScore = score
        bestTarget = candidate
      }
    }
    return MatchResult(bestScore, normalized, bestTarget)
  }

  private fun bestWindowScore(observed: String, candidate: String): Double {
    if (observed.contains(candidate)) return 1.0
    if (candidate.contains(observed) && observed.length >= 4) {
      return observed.length.toDouble() / candidate.length.toDouble()
    }

    val minWindow = maxOf(3, candidate.length - 1)
    val maxWindow = minOf(observed.length, candidate.length + 1)
    if (minWindow > maxWindow) return similarity(observed, candidate)

    var best = 0.0
    for (windowLength in minWindow..maxWindow) {
      for (start in 0..observed.length - windowLength) {
        val window = observed.substring(start, start + windowLength)
        best = maxOf(best, similarity(window, candidate))
      }
    }
    return best
  }

  private fun similarity(a: String, b: String): Double {
    val distance = levenshtein(a, b)
    return (1.0 - distance.toDouble() / maxOf(a.length, b.length).toDouble())
      .coerceIn(0.0, 1.0)
  }

  private fun levenshtein(a: String, b: String): Int {
    if (a.isEmpty()) return b.length
    if (b.isEmpty()) return a.length

    var previous = IntArray(b.length + 1) { it }
    var current = IntArray(b.length + 1)
    for (i in a.indices) {
      current[0] = i + 1
      for (j in b.indices) {
        val cost = if (a[i] == b[j]) 0 else 1
        current[j + 1] = minOf(
          current[j] + 1,
          previous[j + 1] + 1,
          previous[j] + cost
        )
      }
      val swap = previous
      previous = current
      current = swap
    }
    return previous[b.length]
  }
}
