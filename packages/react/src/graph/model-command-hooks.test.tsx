import {
  createRuntimeProtocolResponse,
  type RuntimeTransport,
} from '@ontahi/core/runtime/protocol';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import { OntahiGraphProvider, useModelCommand } from './index.js';

it('creates a model command client from the provider Runtime Transport', async () => {
  const request = vi.fn<RuntimeTransport['request']>(async envelope =>
    createRuntimeProtocolResponse(envelope, {
      version: 1,
      kind: 'model-command-result',
      result: { status: 'answered', message: 'Ontahí can help.' },
    }),
  );
  const runtimeTransport = { request };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <OntahiGraphProvider runtime={{ name: 'test-runtime' }} runtimeTransport={runtimeTransport}>
      {children}
    </OntahiGraphProvider>
  );
  const { result } = renderHook(() => useModelCommand(), { wrapper });

  await expect(result.current.submit({ text: 'What can I do?' })).resolves.toEqual({
    ok: true,
    value: { status: 'answered', message: 'Ontahí can help.' },
  });
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    family: 'model.command',
    body: { version: 1, kind: 'model-command', text: 'What can I do?' },
  });
});
