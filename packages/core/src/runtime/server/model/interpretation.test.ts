import { describe, expect, it, vi } from 'vitest';

import { field, graphSchema } from '../../../data-graph/index.js';

import type { ModelGraphCommandExposure } from './command/graph.js';
import {
  interpretModelRequest,
  validateModelInvocation,
  type ModelOperationExposure,
  type ModelRequest,
} from './interpretation.js';
import type { ModelGraphReadExposure } from './read/graph.js';

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
  it('accepts validated choices for one canonical action', async () => {
    const choice = {
      status: 'choice',
      prompt: 'Which document?',
      options: [
        {
          id: 'doc-1',
          label: 'Notes',
          request: proposal({ documentId: 'doc-1', name: 'Notes' }).request,
        },
        {
          id: 'doc-2',
          label: 'Archive',
          request: proposal({ documentId: 'doc-2', name: 'Notes' }).request,
        },
      ],
    };
    const choiceExposure: ModelOperationExposure = {
      ...exposure,
      validate: (_input, context) =>
        context?.kind === 'choice-option' ? undefined : 'Choose a document.',
    };

    await expect(run(choice, { operations: [choiceExposure] })).resolves.toEqual(choice);
  });
  it('rejects a choice that mixes different actions', async () => {
    const mixed = {
      status: 'choice',
      prompt: 'What next?',
      options: [
        { id: 'one', label: 'Rename', request: proposal().request },
        {
          id: 'two',
          label: 'Read',
          request: { version: 1, kind: 'graph-read', mode: 'count' },
        },
      ],
    };
    await expect(run(mixed)).rejects.toHaveProperty('code', 'model_output_invalid');
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
      'reads',
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
    expect(modelRequest!.instructions).toContain(
      'Preserve user-supplied entity names and string field values exactly',
    );
  });
  it('accepts an advertised canonical graph read and instructs the model to use it for data', async () => {
    let modelRequest: ModelRequest | undefined;
    const read: ModelGraphReadExposure = {
      description: 'Read documents.',
      request: graphSchema.object(
        {
          version: graphSchema.literal(1),
          kind: graphSchema.literal('graph-read'),
          mode: graphSchema.literal('run'),
          selection: graphSchema.object(
            {
              kind: graphSchema.literal('selection'),
              entityName: graphSchema.literal('Document'),
              expression: graphSchema.object(
                { kind: graphSchema.literal('all') },
                { unknownKeys: 'strict' },
              ),
            },
            { unknownKeys: 'strict' },
          ),
          orderBy: graphSchema.array(
            graphSchema.object(
              {
                fieldName: graphSchema.literal('name'),
                direction: graphSchema.union([
                  graphSchema.literal('asc'),
                  graphSchema.literal('desc'),
                ]),
              },
              { unknownKeys: 'strict' },
            ),
          ),
        },
        { unknownKeys: 'strict' },
      ),
      validate: () => undefined,
    };
    const output = {
      status: 'resolved',
      request: {
        version: 1,
        kind: 'graph-read',
        mode: 'run',
        selection: { kind: 'selection', entityName: 'Document', expression: { kind: 'all' } },
        orderBy: [],
      },
    } as const;

    await expect(
      run(output, {
        reads: [read],
        provider: {
          generate: async (request: ModelRequest) => {
            modelRequest = request;
            return output;
          },
        },
      }),
    ).resolves.toEqual(output);
    expect(JSON.parse(modelRequest!.context).reads[0].description).toBe('Read documents.');
    expect(modelRequest!.instructions).toContain(
      'Never answer those questions from the supplied context.',
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
