import { describe, expect, it, vi } from 'vitest';

import { createOntahiDiagnostics } from './diagnostics.js';

describe('createOntahiDiagnostics', () => {
  it('requires a positive capacity and an explicit redactor for payload capture', () => {
    expect(() => createOntahiDiagnostics({ capacity: 0 })).toThrow(/positive integer/);
    expect(() => createOntahiDiagnostics({ capturePayloads: true })).toThrow(/requires a redactor/);
  });

  it('provides stable snapshots, clear, and idempotent unsubscribe', () => {
    const diagnostics = createOntahiDiagnostics();
    const listener = vi.fn();
    const unsubscribe = diagnostics.subscribe(listener);
    const initial = diagnostics.inspect();

    expect(diagnostics.inspect()).toBe(initial);
    diagnostics.clear();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(diagnostics.inspect()).toEqual({ version: 1, events: [] });

    unsubscribe();
    unsubscribe();
    diagnostics.clear();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
