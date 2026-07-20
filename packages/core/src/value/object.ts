export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export const mapRecordAsync = async <T extends Record<string, unknown>, R>(
  record: T,
  mapFn: (value: T[keyof T], key: keyof T) => Promise<R>,
): Promise<Record<keyof T, R>> =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(record).map(async ([key, value]) => [
        key,
        await mapFn(value as T[keyof T], key as keyof T),
      ]),
    ),
  ) as Record<keyof T, R>;
