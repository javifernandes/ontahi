import { expect, it, vi } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphStorage,
  field,
  graphSchema,
  toGraphCommandRequest,
  type GraphCommandRequest,
} from '../../data-graph/index.js';

import { entity } from './entity.js';
import { getCurrentInvocationContext, withInvocationContext } from './invocation-context.js';
import { createModelCommandRuntime, type ModelCommandScope } from './model-command.js';
import { ontahi, type GraphCommandableOntahiApplication } from './ontahi.js';

const fixture = () => {
  const Document = entity({
    name: 'Document',
    fields: { id: field.id(), title: field.nonEmptyString() },
  });
  const storage = createInMemoryDataGraphStorage({
    dataset: { Document: [{ id: 'one', title: 'Before' }] },
  });
  const application = ontahi({ entities: [Document], storage });
  const target = createEntityRef(Document, { id: 'one' });
  const binding = {
    description: 'Rename a document.',
    request: graphSchema.object(
      {
        version: graphSchema.literal(2),
        kind: graphSchema.literal('graph-command'),
        command: graphSchema.object(
          {
            kind: graphSchema.literal('entity-mutation-command'),
            action: graphSchema.literal('update'),
            entityName: graphSchema.literal('Document'),
            target: graphSchema.ref(Document),
            values: graphSchema.object({ title: Document.fields.title }, { unknownKeys: 'strict' }),
            if: graphSchema.object({ title: Document.fields.title }, { unknownKeys: 'strict' }),
          },
          { unknownKeys: 'strict' },
        ),
      },
      { unknownKeys: 'strict' },
    ),
    validate: (_request: GraphCommandRequest): string | undefined => undefined,
  };
  const scope = vi.fn(
    async (): Promise<ModelCommandScope> => ({ context: {}, bindings: {}, commands: [binding] }),
  );
  const proposal = {
    status: 'resolved',
    request: toGraphCommandRequest({
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: 'Document',
      target,
      values: { title: 'After' },
      if: { title: 'Before' },
    }),
  };
  // Use the same policy-enforcing dispatcher as browser graph writes.
  const graph = (
    application as unknown as GraphCommandableOntahiApplication
  ).createGraphCommandDispatcher([
    {
      entity: Document,
      scope: 'all',
      actions: { update: { fields: ['title'], if: ['title'], result: ['id', 'title'] } },
    },
  ]);
  const dispatchCommand = vi.fn(async (request: GraphCommandRequest) =>
    graph(request, {
      authority: { principal: getCurrentInvocationContext()?.principal },
    }),
  );
  const generate = vi.fn(async () => proposal);
  const authorize = vi.fn();
  const runtime = () =>
    createModelCommandRuntime({
      application,
      provider: { generate },
      scope,
      authorize,
      dispatchCommand,
    });
  return { proposal, storage, scope, binding, dispatchCommand, generate, authorize, runtime };
};
it('dispatches a canonical graph update without domain operations', async () => {
  const f = fixture();
  const result = await withInvocationContext(
    { principal: { kind: 'user', subject: 'reader' } },
    () => f.runtime().submit({ text: 'rename Before to After' }, new AbortController().signal),
  );
  expect(result).toEqual({ status: 'executed', message: 'Updated.' });
  expect(f.storage.dataset.Document![0]!.title).toBe('After');
  expect(f.dispatchCommand).toHaveBeenCalledOnce();
  expect(f.dispatchCommand.mock.calls[0]![0]).toEqual(f.proposal.request);
  expect(f.dispatchCommand.mock.calls[0]![0]).toMatchObject({
    command: { action: 'update', values: { title: 'After' }, if: { title: 'Before' } },
  });
  expect(f.authorize).toHaveBeenCalledTimes(2);
});
it('rejects exposure removal between inference and dispatch', async () => {
  const f = fixture();
  f.scope
    .mockResolvedValueOnce({ context: {}, bindings: {}, commands: [f.binding] })
    .mockResolvedValueOnce({ context: {}, bindings: {}, commands: [] });
  await expect(
    f.runtime().submit({ text: 'rename' }, new AbortController().signal),
  ).rejects.toHaveProperty('code', 'proposal_out_of_scope');
  expect(f.dispatchCommand).not.toHaveBeenCalled();
});
it('does not dispatch when a target becomes ambiguous', async () => {
  const f = fixture();
  f.scope
    .mockResolvedValueOnce({ context: {}, bindings: {}, commands: [f.binding] })
    .mockResolvedValueOnce({
      context: {},
      bindings: {},
      commands: [{ ...f.binding, validate: () => 'Which document?' }],
    });
  expect(await f.runtime().submit({ text: 'rename' }, new AbortController().signal)).toEqual({
    status: 'unresolved',
    message: 'Which document?',
  });
  expect(f.dispatchCommand).not.toHaveBeenCalled();
});
it('respects conditional graph writes when the target changes just before execution', async () => {
  const f = fixture();
  f.generate.mockImplementation(async () => {
    f.storage.dataset.Document![0]!.title = 'Changed elsewhere';
    return f.proposal;
  });
  await expect(
    f.runtime().submit({ text: 'rename' }, new AbortController().signal),
  ).rejects.toHaveProperty('code', 'command_execution_failed');
  expect(f.storage.dataset.Document![0]!.title).toBe('Changed elsewhere');
});
it('does not dispatch updates after cancellation or revoked authorization', async () => {
  for (const cancel of [true, false]) {
    const f = fixture();
    const controller = new AbortController();
    if (cancel)
      f.generate.mockImplementation(async () => {
        controller.abort();
        return f.proposal;
      });
    else f.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    await expect(f.runtime().submit({ text: 'rename' }, controller.signal)).rejects.toThrow();
    expect(f.dispatchCommand).not.toHaveBeenCalled();
  }
});
