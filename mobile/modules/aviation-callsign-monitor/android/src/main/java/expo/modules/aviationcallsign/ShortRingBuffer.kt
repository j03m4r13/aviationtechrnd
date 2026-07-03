package expo.modules.aviationcallsign

internal class ShortRingBuffer(capacity: Int) {
  private val data = ShortArray(capacity)
  private var writeIndex = 0
  private var size = 0

  fun append(samples: ShortArray, count: Int) {
    for (index in 0 until count) {
      data[writeIndex] = samples[index]
      writeIndex = (writeIndex + 1) % data.size
      if (size < data.size) size++
    }
  }

  fun snapshot(): ShortArray {
    val result = ShortArray(size)
    val start = (writeIndex - size + data.size) % data.size
    for (index in 0 until size) {
      result[index] = data[(start + index) % data.size]
    }
    return result
  }

  fun clear() {
    writeIndex = 0
    size = 0
  }
}

internal class ShortAccumulator(initialCapacity: Int = 16_000) {
  private var data = ShortArray(initialCapacity)
  var size: Int = 0
    private set

  fun append(samples: ShortArray, count: Int) {
    ensureCapacity(size + count)
    samples.copyInto(data, destinationOffset = size, startIndex = 0, endIndex = count)
    size += count
  }

  fun append(samples: ShortArray) = append(samples, samples.size)

  fun toArray(): ShortArray = data.copyOf(size)

  fun clear() {
    size = 0
  }

  private fun ensureCapacity(required: Int) {
    if (required <= data.size) return
    var next = data.size
    while (next < required) next *= 2
    data = data.copyOf(next)
  }
}
