package expo.modules.aviationcallsign

internal object CallsignNormalizer {
  private val tokenMap = mapOf(
    "zero" to "0", "oh" to "0",
    "one" to "1", "wun" to "1",
    "two" to "2", "too" to "2",
    "three" to "3", "tree" to "3",
    "four" to "4", "fower" to "4", "for" to "4",
    "five" to "5", "fife" to "5",
    "six" to "6",
    "seven" to "7",
    "eight" to "8", "ait" to "8",
    "nine" to "9", "niner" to "9",
    "alpha" to "A", "alfa" to "A",
    "bravo" to "B",
    "charlie" to "C",
    "delta" to "D",
    "echo" to "E",
    "foxtrot" to "F",
    "golf" to "G",
    "hotel" to "H",
    "india" to "I",
    "juliett" to "J", "juliet" to "J",
    "kilo" to "K",
    "lima" to "L",
    "mike" to "M",
    "november" to "N",
    "oscar" to "O",
    "papa" to "P",
    "quebec" to "Q",
    "romeo" to "R",
    "sierra" to "S",
    "tango" to "T",
    "uniform" to "U",
    "victor" to "V",
    "whiskey" to "W", "whisky" to "W",
    "xray" to "X", "x-ray" to "X",
    "yankee" to "Y",
    "zulu" to "Z"
  )

  private val phoneticWords = tokenMap.keys
  private val characterToWord = mapOf(
    '0' to "zero", '1' to "one", '2' to "two", '3' to "three", '4' to "four",
    '5' to "five", '6' to "six", '7' to "seven", '8' to "eight", '9' to "nine",
    'A' to "alpha", 'B' to "bravo", 'C' to "charlie", 'D' to "delta", 'E' to "echo",
    'F' to "foxtrot", 'G' to "golf", 'H' to "hotel", 'I' to "india", 'J' to "juliett",
    'K' to "kilo", 'L' to "lima", 'M' to "mike", 'N' to "november", 'O' to "oscar",
    'P' to "papa", 'Q' to "quebec", 'R' to "romeo", 'S' to "sierra", 'T' to "tango",
    'U' to "uniform", 'V' to "victor", 'W' to "whiskey", 'X' to "xray", 'Y' to "yankee",
    'Z' to "zulu"
  )

  fun normalizeTarget(value: String): String =
    value.uppercase().filter { it.isLetterOrDigit() }

  fun normalizeTranscript(value: String): String {
    val normalizedWords = value
      .lowercase()
      .replace(Regex("[^a-z0-9-]+"), " ")
      .trim()
      .split(Regex("\\s+"))

    return buildString {
      for (word in normalizedWords) {
        val mapped = tokenMap[word]
        when {
          mapped != null -> append(mapped)
          word.all { it.isLetterOrDigit() } -> append(word.uppercase())
        }
      }
    }
  }

  fun spokenTarget(value: String): String = normalizeTarget(value)
    .mapNotNull(characterToWord::get)
    .joinToString(" ")

  fun grammar(target: String, aliases: List<String>): String {
    val phrases = linkedSetOf<String>()
    val spoken = spokenTarget(target)
    if (spoken.isNotBlank()) {
      phrases += spoken
      val words = spoken.split(' ')
      for (drop in 1..minOf(3, words.size - 3)) {
        phrases += words.drop(drop).joinToString(" ")
      }
    }

    aliases.map(String::trim).filter(String::isNotEmpty).forEach(phrases::add)
    phrases += "cessna $spoken"
    phrases += "piper $spoken"
    phrases += "november $spoken"
    phrases += "[unk]"

    return phrases.joinToString(prefix = "[", postfix = "]") { phrase ->
      "\"${phrase.replace("\\", "\\\\").replace("\"", "\\\"")}\""
    }
  }

  fun vocabularyWords(): Set<String> = phoneticWords
}
