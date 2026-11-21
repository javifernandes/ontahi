import type {
  GraphClientCacheEvent,
  GraphClientCacheEventInput,
  GraphClientCacheListener,
} from './records.js';

export const createGraphClientCacheEvents = () => {
  const listeners = new Set<GraphClientCacheListener>();
  let version = 0;

  return {
    get version() {
      return version;
    },
    emit: (event: GraphClientCacheEventInput) => {
      version += 1;
      const versionedEvent = { ...event, version } as GraphClientCacheEvent;
      for (const listener of listeners) listener(versionedEvent);
    },
    subscribe: (listener: GraphClientCacheListener): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
