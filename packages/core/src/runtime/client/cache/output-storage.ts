import type { GraphClientCacheOutputRecord } from './records.js';

export const createGraphClientOutputStorage = () => {
  const records = new Map<string, GraphClientCacheOutputRecord>();

  return {
    clear: () => records.clear(),
    get: (keyHash: string) => records.get(keyHash),
    set: (record: GraphClientCacheOutputRecord) => records.set(record.keyHash, record),
    values: () => records.values(),
  };
};
