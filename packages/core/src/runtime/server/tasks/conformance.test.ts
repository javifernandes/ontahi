import { describe, it } from 'vitest';

import { verifyTaskStorageConformance } from './conformance.js';
import { createInMemoryTaskStorage } from './memory-store.js';

describe('Task Storage conformance', () => {
  it('accepts the in-memory reference storage', async () => {
    const storage = createInMemoryTaskStorage();
    await verifyTaskStorageConformance({
      createStorage: () => storage,
      identityPrefix: 'memory-conformance',
    });
  });
});
