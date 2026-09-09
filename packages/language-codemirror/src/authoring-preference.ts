import type { ConsoleDialect } from '@ontahi/language';

const storageKey = 'ontahi.authoring.dialect';
const changeEvent = 'ontahi-authoring-dialect-change';
let memoryPreference: ConsoleDialect | undefined;
let memoryOnly = false;

/** Browser-local authoring preference, never runtime authority or server-owned application data. */
export const authoringDialectPreference = {
  getSnapshot: (): ConsoleDialect | undefined => {
    if (typeof globalThis.document === 'undefined') return undefined;
    if (memoryOnly) return memoryPreference;
    try {
      const stored = globalThis.localStorage.getItem(storageKey);
      return stored === 'ts' || stored === 'declarative' ? stored : undefined;
    } catch {
      return memoryPreference;
    }
  },
  getServerSnapshot: (): undefined => undefined,
  set: (dialect: ConsoleDialect | undefined): void => {
    if (typeof globalThis.document === 'undefined') return;
    memoryPreference = dialect;
    try {
      if (dialect) globalThis.localStorage.setItem(storageKey, dialect);
      else globalThis.localStorage.removeItem(storageKey);
      memoryOnly = false;
    } catch {
      // Restricted storage keeps a usable preference for the current page only.
      memoryOnly = true;
    }
    globalThis.dispatchEvent(new Event(changeEvent));
  },
  subscribe: (notify: () => void): (() => void) => {
    if (typeof globalThis.document === 'undefined') return () => {};
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) notify();
    };
    globalThis.addEventListener(changeEvent, notify);
    globalThis.addEventListener('storage', onStorage);
    return () => {
      globalThis.removeEventListener(changeEvent, notify);
      globalThis.removeEventListener('storage', onStorage);
    };
  },
};
