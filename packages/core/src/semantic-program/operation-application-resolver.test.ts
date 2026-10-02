import { describe, expect, it, vi } from 'vitest';

import { createEntityRef, entity, field, graphSchema } from '../data-graph/index.js';

import {
  createAuthorizedEntityRefOperationApplicationResolver,
  resolveOperationApplicationHoleWith,
  scalarFreeInputOperationApplicationResolver,
  submitOperationApplicationFreeInput,
  type OperationApplicationHoleResolver,
} from './operation-application-resolver.js';
import {
  lowerOperationApplication,
  normalizeOperationApplication,
  operationApplicationHole,
} from './operation-application.js';

const TodoList = entity('SemanticResolverTodoList', {
  id: field.id(),
  name: field.string(),
});
const rename = {
  id: 'SemanticResolverTodoList.rename',
  input: graphSchema.object({
    list: graphSchema.ref(TodoList),
    name: field.nonEmptyString({ trim: true }),
  }),
};

describe('Operation application Hole resolvers', () => {
  it('offers direct scalar positions as free input and validates the submitted value', async () => {
    const application = normalizeOperationApplication(rename, {
      list: createEntityRef(TodoList, { id: 'list-inbox' }),
    });
    const resolution = await resolveOperationApplicationHoleWith({
      contract: rename,
      application,
      holeId: 'name',
      resolvers: [scalarFreeInputOperationApplicationResolver],
    });

    expect(resolution).toEqual({ status: 'free-input', holeId: 'name' });
    if (resolution.status !== 'free-input') return;
    expect(submitOperationApplicationFreeInput(rename, application, resolution, '')).toMatchObject({
      success: false,
      reason: 'invalid-substitution',
      issues: [{ path: ['name'] }],
    });
    const submitted = submitOperationApplicationFreeInput(
      rename,
      application,
      resolution,
      '  Inbox  ',
    );
    expect(submitted).toMatchObject({
      success: true,
      provenance: { kind: 'free-input' },
      application: { arguments: { name: { kind: 'value', value: '  Inbox  ' } } },
    });
    if (!submitted.success) return;
    expect(lowerOperationApplication(rename, submitted.application)).toMatchObject({
      success: true,
      request: { input: { name: 'Inbox' } },
    });
  });

  it('lets resolvers abstain and changes policy without changing the authored application', async () => {
    const application = normalizeOperationApplication(rename, {
      list: createEntityRef(TodoList, { id: 'list-inbox' }),
    });
    const abstain = vi.fn<OperationApplicationHoleResolver>(async context => {
      expect(context.positions).toEqual([{ name: 'name', schema: rename.input.fields.name }]);
      return undefined;
    });

    await expect(
      resolveOperationApplicationHoleWith({
        contract: rename,
        application,
        holeId: 'name',
        resolvers: [abstain],
      }),
    ).resolves.toEqual({ status: 'unresolved', holeId: 'name', reason: 'unsupported-hole' });
    await expect(
      resolveOperationApplicationHoleWith({
        contract: rename,
        application,
        holeId: 'name',
        resolvers: [abstain, scalarFreeInputOperationApplicationResolver],
      }),
    ).resolves.toEqual({ status: 'free-input', holeId: 'name' });
    expect(application).toEqual(
      normalizeOperationApplication(rename, {
        list: createEntityRef(TodoList, { id: 'list-inbox' }),
      }),
    );
  });

  it('adapts authorized Entity Ref discovery to the replaceable resolver contract', async () => {
    const application = normalizeOperationApplication(rename, { name: 'Inbox' });
    const read = vi.fn(async () => ({
      kind: 'graph-read-result' as const,
      value: [{ id: 'list-inbox' }, { id: 'list-later' }],
    }));
    const resolver = createAuthorizedEntityRefOperationApplicationResolver({
      graph: { getOperation: () => rename },
      read,
      authority: { subject: 'reader' },
    });

    await expect(
      resolveOperationApplicationHoleWith({
        contract: rename,
        application,
        holeId: 'list',
        resolvers: [scalarFreeInputOperationApplicationResolver, resolver],
      }),
    ).resolves.toMatchObject({
      status: 'choice',
      candidates: [
        { value: { locator: { id: 'list-inbox' } } },
        { value: { locator: { id: 'list-later' } } },
      ],
    });
    expect(read).toHaveBeenCalledOnce();

    const scalarApplication = normalizeOperationApplication(rename, {
      list: createEntityRef(TodoList, { id: 'list-inbox' }),
    });
    await expect(
      resolveOperationApplicationHoleWith({
        contract: rename,
        application: scalarApplication,
        holeId: 'name',
        resolvers: [resolver, scalarFreeInputOperationApplicationResolver],
      }),
    ).resolves.toEqual({ status: 'free-input', holeId: 'name' });
    expect(read).toHaveBeenCalledOnce();
  });

  it('validates the application and every named-Hole position before invoking resolvers', async () => {
    const application = normalizeOperationApplication(rename, {
      list: operationApplicationHole('shared'),
      name: operationApplicationHole('shared'),
    });
    const resolver = vi.fn<OperationApplicationHoleResolver>(async context => {
      expect(context.positions.map(position => position.name)).toEqual(['list', 'name']);
      return undefined;
    });

    await resolveOperationApplicationHoleWith({
      contract: rename,
      application,
      holeId: 'shared',
      resolvers: [resolver],
    });
    expect(resolver).toHaveBeenCalledOnce();
    await expect(
      resolveOperationApplicationHoleWith({
        contract: { ...rename, id: 'Other.rename' },
        application,
        holeId: 'shared',
        resolvers: [resolver],
      }),
    ).resolves.toMatchObject({ status: 'unresolved', reason: 'unknown-operation' });
    await expect(
      resolveOperationApplicationHoleWith({
        contract: rename,
        application,
        holeId: 'missing',
        resolvers: [resolver],
      }),
    ).resolves.toMatchObject({ status: 'unresolved', reason: 'unknown-hole' });
    expect(resolver).toHaveBeenCalledOnce();
  });

  it('rejects stale free-input submissions and unsupported composite positions', async () => {
    const application = normalizeOperationApplication(rename, {
      list: createEntityRef(TodoList, { id: 'list-inbox' }),
    });
    expect(
      submitOperationApplicationFreeInput(
        rename,
        application,
        { status: 'free-input', holeId: 'missing' },
        'Inbox',
      ),
    ).toEqual({ success: false, reason: 'unknown-hole', holeId: 'missing' });

    const composite = {
      id: 'Document.publish',
      input: graphSchema.object({ metadata: graphSchema.object({ title: field.string() }) }),
    };
    await expect(
      resolveOperationApplicationHoleWith({
        contract: composite,
        application: normalizeOperationApplication(composite),
        holeId: 'metadata',
        resolvers: [scalarFreeInputOperationApplicationResolver],
      }),
    ).resolves.toMatchObject({ status: 'unresolved', reason: 'unsupported-hole' });

    const unknownPosition = normalizeOperationApplication(rename, {
      list: createEntityRef(TodoList, { id: 'list-inbox' }),
      name: 'Inbox',
      extra: operationApplicationHole('extra'),
    } as never);
    await expect(
      resolveOperationApplicationHoleWith({
        contract: rename,
        application: unknownPosition,
        holeId: 'extra',
        resolvers: [scalarFreeInputOperationApplicationResolver],
      }),
    ).resolves.toMatchObject({ status: 'unresolved', reason: 'unsupported-hole' });
  });
});
