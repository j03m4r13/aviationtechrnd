import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number): string {
  return `${key}.chunk.${index}`;
}

function countKey(key: string): string {
  return `${key}.chunks`;
}

async function removeChunks(key: string): Promise<void> {
  const rawCount = await SecureStore.getItemAsync(countKey(key));
  const count = Number(rawCount ?? 0);

  await Promise.all([
    SecureStore.deleteItemAsync(key),
    SecureStore.deleteItemAsync(countKey(key)),
    ...Array.from({ length: Number.isFinite(count) ? count : 0 }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, index))
    )
  ]);
}

export const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const direct = await SecureStore.getItemAsync(key);
    if (direct !== null) {
      return direct;
    }

    const rawCount = await SecureStore.getItemAsync(countKey(key));
    const count = Number(rawCount ?? 0);
    if (!Number.isFinite(count) || count <= 0) {
      return null;
    }

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(key, index))
      )
    );

    if (chunks.some((chunk) => chunk === null)) {
      await removeChunks(key);
      return null;
    }

    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await removeChunks(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks = Array.from(
      { length: Math.ceil(value.length / CHUNK_SIZE) },
      (_, index) => value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
    );

    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(key, index), chunk)
      )
    );
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    await removeChunks(key);
  }
};
