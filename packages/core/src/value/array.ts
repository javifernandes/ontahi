export const normalizeUniqueLowercaseStrings = (values: readonly string[]): string[] => {
  const normalizedValues = new Set<string>();

  values.forEach(value => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    normalizedValues.add(normalized);
  });

  return Array.from(normalizedValues);
};

export const chunkArray = <TValue>(
  values: readonly TValue[],
  size: number,
): Array<readonly TValue[]> => {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`chunkArray size must be a positive integer. Received: ${size}`);
  }

  const chunks: Array<readonly TValue[]> = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};
