import {
  createRuntimeProtocolRequest,
  createRuntimeProtocolResponse,
} from '@ontahi/core/runtime/protocol';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from '../diagnostics.js';
import { instrumentRuntimeTransport } from '../instrument-runtime-transport.js';

import { OntahiDevtools } from './ontahi-devtools.js';

describe('OntahiDevtools', () => {
  it('opens, shows semantic exchanges, reveals detail, clears, and closes', async () => {
    const diagnostics = createOntahiDiagnostics({
      capturePayloads: true,
      redact: value => value,
    });
    const runtimeRequest = createRuntimeProtocolRequest({
      id: 'read-1',
      family: 'graph.read',
      body: { selection: 'TodoList' },
    });
    const transport = instrumentRuntimeTransport({
      diagnostics,
      id: 'http',
      kind: 'fetch',
      transport: {
        request: vi
          .fn()
          .mockResolvedValue(createRuntimeProtocolResponse(runtimeRequest, { rows: 1 })),
      },
    });
    await transport.request(runtimeRequest);
    render(<OntahiDevtools diagnostics={diagnostics} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Ontahí Devtools' }));
    expect(screen.getByRole('complementary', { name: 'Ontahí Devtools' })).toBeTruthy();
    expect(screen.getByText('graph.read')).toBeTruthy();
    expect(screen.getByText('success')).toBeTruthy();

    fireEvent.click(screen.getByText('graph.read'));
    expect(screen.getByText(/TodoList/)).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter diagnostics' }), {
      target: { value: 'operation' },
    });
    expect(screen.getByText(/Run an Ontahí query/)).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter diagnostics' }), {
      target: { value: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText(/Run an Ontahí query/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close Devtools' }));
    expect(screen.getByRole('button', { name: 'Open Ontahí Devtools' })).toBeTruthy();
  });
});
