import { expect, it, vi } from 'vitest';

import {
  createEntityRef,
  createInMemoryDataGraphStorage,
  entityRefsEqual,
  field,
  graphSchema,
  toGraphCommandRequest,
  type UpdateEntityMutationCommand,
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
    target: graphSchema.object({ title: field.nonEmptyString() }, { unknownKeys: 'strict' }),
    values: graphSchema.object({ title: Document.fields.title }, { unknownKeys: 'strict' }),
    unresolvedReason: 'Which document?',
    prepare: (
      _args: Record<string, unknown>,
      values: Record<string, unknown>,
    ): UpdateEntityMutationCommand => ({
      kind: 'entity-mutation-command',
      action: 'update',
      entityName: 'Document',
      target,
      values,
      if: { title: 'Before' },
    }),
    validate: (command: UpdateEntityMutationCommand) =>
      entityRefsEqual(command.target, target) ? undefined : 'Wrong target',
  };
  const scope = vi.fn(
    async (): Promise<ModelCommandScope> => ({
      context: {},
      bindings: {},
      updates: { Document: binding },
    }),
  );
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
  const dispatchUpdate = vi.fn(async (command: UpdateEntityMutationCommand) =>
    graph(toGraphCommandRequest(command), {
      authority: { principal: getCurrentInvocationContext()?.principal },
    }),
  );
  const generate = vi.fn(async () => ({
    status: 'update',
    entityName: 'Document',
    target: { title: 'Before' },
    values: { title: 'After' },
  }));
  const authorize = vi.fn();
  const runtime = () =>
    createModelCommandRuntime({
      application,
      provider: { generate },
      scope,
      authorize,
      dispatchUpdate,
    });
  return { storage, scope, binding, dispatchUpdate, generate, authorize, runtime };
};
it('dispatches a canonical graph update without domain operations', async () => {
  const f = fixture();
  const result = await withInvocationContext(
    { principal: { kind: 'user', subject: 'reader' } },
    () => f.runtime().submit({ text: 'rename Before to After' }, new AbortController().signal),
  );
  expect(result).toEqual({ status: 'executed', message: 'Updated.' });
  expect(f.storage.dataset.Document![0]!.title).toBe('After');
  expect(f.dispatchUpdate).toHaveBeenCalledOnce();
  expect(f.dispatchUpdate.mock.calls[0]![0]).toMatchObject({
    action: 'update',
    values: { title: 'After' },
    if: { title: 'Before' },
  });
  expect(f.authorize).toHaveBeenCalledTimes(2);
});
it('rejects exposure removal between inference and dispatch', async () => {
  const f = fixture();
  f.scope
    .mockResolvedValueOnce({ context: {}, bindings: {}, updates: { Document: f.binding } })
    .mockResolvedValueOnce({ context: {}, bindings: {}, updates: {} });
  await expect(
    f.runtime().submit({ text: 'rename' }, new AbortController().signal),
  ).rejects.toHaveProperty('code', 'proposal_out_of_scope');
  expect(f.dispatchUpdate).not.toHaveBeenCalled();
});
it('does not dispatch when a target becomes ambiguous', async () => {
  const f = fixture();
  f.scope
    .mockResolvedValueOnce({ context: {}, bindings: {}, updates: { Document: f.binding } })
    .mockResolvedValueOnce({
      context: {},
      bindings: {},
      updates: { Document: { ...f.binding, prepare: () => null } },
    });
  expect(await f.runtime().submit({ text: 'rename' }, new AbortController().signal)).toEqual({
    status: 'unresolved',
    message: 'Which document?',
  });
  expect(f.dispatchUpdate).not.toHaveBeenCalled();
});
it('respects conditional graph writes when the target changes just before execution', async () => {
  const f = fixture();
  f.generate.mockImplementation(async () => {
    f.storage.dataset.Document![0]!.title = 'Changed elsewhere';
    return {
      status: 'update',
      entityName: 'Document',
      target: { title: 'Before' },
      values: { title: 'After' },
    };
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
        return {
          status: 'update',
          entityName: 'Document',
          target: { title: 'Before' },
          values: { title: 'After' },
        };
      });
    else f.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    await expect(f.runtime().submit({ text: 'rename' }, controller.signal)).rejects.toThrow();
    expect(f.dispatchUpdate).not.toHaveBeenCalled();
  }
});
