import { describe, expect, it, vi } from 'vitest';

import { field, graphSchema } from '../../data-graph/index.js';

import {
  interpretModelOperation,
  validateModelInvocation,
  type ModelOperationExposure,
} from './model-interpretation.js';

const schema = graphSchema.object(
  { documentId: field.string(), name: field.nonEmptyString() },
  { unknownKeys: 'strict' },
);
const resolveOperation = (id: string) => (id === 'Document.rename' ? { input: schema } : undefined);
const exposure: ModelOperationExposure = {
  operationId: 'Document.rename',
  description: 'Rename the current document.',
  arguments: graphSchema.object({ name: field.nonEmptyString() }, { unknownKeys: 'strict' }),
  prepare: args => ({ documentId: 'doc-1', name: args.name }),
  validate: input =>
    input.documentId === 'doc-1' ? undefined : 'Document is outside the current scope.',
};
const proposal = (input: unknown = { name: 'Notes' }, operationId = 'Document.rename') => ({
  status: 'resolved',
  invocation: { kind: 'invoke', operationId, input },
});
const run = (output: unknown, overrides = {}) =>
  interpretModelOperation({
    provider: { generate: async () => output },
    operations: [exposure],
    resolveOperation,
    context: { document: 'doc-1' },
    prompt: 'rename this document to Notes',
    signal: new AbortController().signal,
    ...overrides,
  });

describe('model operation interpretation', () => {
  it('binds projected arguments to a canonical invocation without dispatching', async () => {
    expect(await run(proposal())).toEqual(proposal({ documentId: 'doc-1', name: 'Notes' }));
  });
  it.each([
    proposal({}, 'Document.erase'),
    proposal({ name: 'Notes', documentId: 'foreign' }),
    { status: 'resolved' },
    proposal({ name: '' }),
  ])('rejects unknown operations and malformed arguments', async output => {
    await expect(run(output)).rejects.toHaveProperty('code');
  });
  it('validates the prepared input against the real operation schema', async () => {
    await expect(
      run(proposal(), { operations: [{ ...exposure, prepare: () => ({ name: 42 }) }] }),
    ).rejects.toHaveProperty('code', 'model_output_invalid');
  });
  it('checks fresh scope on canonical proposals from any interpreter', () => {
    expect(
      validateModelInvocation(
        {
          kind: 'invoke',
          operationId: 'Document.rename',
          input: { documentId: 'foreign', name: 'Notes' },
        },
        [exposure],
        resolveOperation,
      ),
    ).toBe('Document is outside the current scope.');
  });
  it('keeps unbindable arguments unresolved', async () => {
    expect(
      await run(proposal(), { operations: [{ ...exposure, prepare: () => null }] }),
    ).toMatchObject({ status: 'unresolved' });
  });
  it('uses the binding explanation when a target is unresolved', async () => {
    expect(
      await run(proposal(), {
        operations: [{ ...exposure, prepare: () => null, unresolvedReason: 'Which document?' }],
      }),
    ).toEqual({ status: 'unresolved', reason: 'Which document?' });
  });
  it('preserves unresolved results', async () => {
    expect(await run({ status: 'unresolved', reason: 'Which document?' })).toEqual({
      status: 'unresolved',
      reason: 'Which document?',
    });
  });
  it('does not call the provider for oversized context', async () => {
    const generate = vi.fn();
    expect(
      await run(proposal(), { provider: { generate }, maxContextCharacters: 1 }),
    ).toMatchObject({ status: 'unresolved' });
    expect(generate).not.toHaveBeenCalled();
  });
  it('discards results after cancellation', async () => {
    const controller = new AbortController();
    await expect(
      run(proposal(), {
        signal: controller.signal,
        provider: {
          generate: async () => {
            controller.abort();
            return proposal();
          },
        },
      }),
    ).rejects.toThrow();
  });
});
