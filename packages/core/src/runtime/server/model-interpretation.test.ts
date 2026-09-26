import { describe, expect, it, vi } from 'vitest';

import { field, graphSchema } from '../../data-graph/index.js';

import type { ModelGraphCommandExposure } from './model-graph-command.js';
import {
  interpretModelRequest,
  validateModelInvocation,
  type ModelOperationExposure,
  type ModelRequest,
} from './model-interpretation.js';

const schema = graphSchema.object(
  { documentId: field.string(), name: field.nonEmptyString() },
  { unknownKeys: 'strict' },
);
const resolveOperation = (id: string) => (id === 'Document.rename' ? { input: schema } : undefined);
const exposure: ModelOperationExposure = {
  operationId: 'Document.rename',
  description: 'Rename the current document.',
  validate: input =>
    input.documentId === 'doc-1' ? undefined : 'Document is outside the current scope.',
};
const proposal = (
  input: unknown = { documentId: 'doc-1', name: 'Notes' },
  operationId = 'Document.rename',
) => ({
  status: 'resolved',
  request: { kind: 'invoke', operationId, input },
});
const run = (output: unknown, overrides = {}) =>
  interpretModelRequest({
    provider: { generate: async () => output },
    operations: [exposure],
    resolveOperation,
    context: { document: 'doc-1' },
    prompt: 'rename this document to Notes',
    signal: new AbortController().signal,
    ...overrides,
  });

describe('model operation interpretation', () => {
  it('preserves canonical invocation inputs without translation', async () => {
    expect(await run(proposal())).toEqual(proposal({ documentId: 'doc-1', name: 'Notes' }));
  });
  it.each([
    proposal({ name: 'Notes', documentId: 'foreign', extra: true }),
    { status: 'resolved' },
    { status: 'help', message: 'Invented capability' },
    { status: 'help', invocation: proposal().request },
    proposal({ name: '' }),
  ])('rejects malformed results and operation arguments', async output => {
    await expect(run(output)).rejects.toHaveProperty('code');
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
  it('preserves unresolved results', async () => {
    expect(await run({ status: 'unresolved', reason: 'Which document?' })).toEqual({
      status: 'unresolved',
      reason: 'Which document?',
    });
  });
  it('presents operations before lower-level graph commands to the model', async () => {
    let modelRequest: ModelRequest | undefined;
    const command: ModelGraphCommandExposure = {
      description: 'Update a document.',
      request: graphSchema.object({ kind: graphSchema.literal('graph-command') }),
      validate: () => undefined,
    };

    await expect(
      run(
        { status: 'help' },
        {
          commands: [command],
          provider: {
            generate: async (request: ModelRequest) => {
              modelRequest = request;
              return { status: 'help' };
            },
          },
        },
      ),
    ).resolves.toEqual({ status: 'help' });

    expect(Object.keys(JSON.parse(modelRequest!.context))).toEqual([
      'context',
      'commands',
      'operations',
    ]);
    const alternatives = (modelRequest!.outputSchema as { anyOf: unknown[] }).anyOf;
    expect(alternatives[0]).toMatchObject({
      properties: {
        request: {
          properties: {
            kind: { const: 'invoke' },
            operationId: { const: 'Document.rename' },
          },
        },
      },
    });
    expect(alternatives[1]).toMatchObject({
      properties: { request: { properties: { kind: { const: 'graph-command' } } } },
    });
    expect(modelRequest!.instructions).toContain(
      'For an editable property change that no advertised operation describes',
    );
  });
  it('gives the interpreter one chance to repair a proposal rejected by scope validation', async () => {
    const valid = proposal();
    const generate = vi
      .fn()
      .mockResolvedValueOnce(proposal({ documentId: 'foreign', name: 'Notes' }))
      .mockResolvedValueOnce(valid);

    await expect(run(valid, { provider: { generate } })).resolves.toEqual(valid);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0].prompt).toContain('Document is outside the current scope.');
    expect(generate.mock.calls[1]![0].prompt).toContain('rename this document to Notes');
  });
  it('repairs an invocation of an operation outside the advertised scope', async () => {
    const valid = proposal();
    const generate = vi
      .fn()
      .mockResolvedValueOnce(proposal({}, 'Document.erase'))
      .mockResolvedValueOnce(valid);

    await expect(run(valid, { provider: { generate } })).resolves.toEqual(valid);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0].prompt).toContain(
      'Operation is outside the configured scope.',
    );
  });
  it('returns the validation reason after the repair proposal is also rejected', async () => {
    const invalid = proposal({ documentId: 'foreign', name: 'Notes' });
    const generate = vi.fn(async () => invalid);

    await expect(run(invalid, { provider: { generate } })).resolves.toEqual({
      status: 'unresolved',
      reason: 'Document is outside the current scope.',
    });
    expect(generate).toHaveBeenCalledTimes(2);
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
