package expo.modules.aviationcallsign

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CallsignMatcherTest {
  @Test
  fun normalizesIcaoPhoneticsAndAviationNumbers() {
    assertEquals(
      "N734AB",
      CallsignNormalizer.normalizeTranscript(
        "November seven tree four alfa bravo"
      )
    )
  }

  @Test
  fun matchesFullAndAbbreviatedGeneralAviationCallsigns() {
    val matcher = CallsignMatcher(
      "N734AB",
      listOf("three four alpha bravo")
    )

    assertEquals(
      1.0,
      matcher.score(
        "Cessna November seven three four alpha bravo"
      ).score,
      0.0001
    )
    assertEquals(
      1.0,
      matcher.score("three four alpha bravo").score,
      0.0001
    )
  }

  @Test
  fun preservesUserSuppliedAirlineTelephonyAliases() {
    val matcher = CallsignMatcher(
      "PAL123",
      listOf("philippine one two three")
    )

    assertEquals(
      1.0,
      matcher.score(
        "Philippine one two three climb flight level two four zero"
      ).score,
      0.0001
    )
  }

  @Test
  fun rejectsAOneCharacterMismatchAtTheImmediateVoskThreshold() {
    val matcher = CallsignMatcher("N734AB", emptyList())

    assertTrue(
      matcher.score("November seven three four alpha delta").score < 0.90
    )
  }
}
