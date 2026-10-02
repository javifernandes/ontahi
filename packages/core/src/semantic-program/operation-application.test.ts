import { describe, expect, it } from 'vitest';

import { createEntityRef, entity, field, graphSchema } from '../data-graph/index.js';

import {
  lowerOperationApplication,
  normalizeOperationApplication,
  operationApplicationHole,
  operationApplicationHoles,
  substituteOperationApplication,
  type OperationApplicationDraft,
} from './operation-application.js';

const TodoList = entity('SemanticProgramTodoList', {
  id: field.id(),
  name: field.string(),
});

const completeAll = {
  id: 'SemanticProgramTodoList.completeAll',
  input: graphSchema.object(
    {
      list: graphSchema.ref(TodoList),
      note: graphSchema.nullable(field.string()),
      reason: graphSchema.optional(field.string()),
      batchSize: graphSchema.default(field.number(), 25),
    },
    { unknownKeys: 'strict' },
  ),
};
const inbox = createEntityRef(TodoList, { id: 'list-inbox' });

describe('Operation application', () => {
  it('requires non-empty Hole ids and an object Operation input', () => {
    expect(() => operationApplicationHole('')).toThrow(
      'Operation application Hole id must not be empty.',
    );
    expect(() =>
      normalizeOperationApplication({ id: 'Document.refresh', input: field.string() } as never),
    ).toThrow('Operation Document.refresh must declare an object input schema.');
  });

  it('infers draft argument types from the existing Operation input schema', () => {
    const acceptDraft = (draft: OperationApplicationDraft<typeof completeAll.input>) => draft;

    expect(acceptDraft({ list: inbox, note: null, batchSize: 10 })).toEqual({
      list: inbox,
      note: null,
      batchSize: 10,
    });
    // @ts-expect-error batchSize is inferred as a number from the Operation schema.
    acceptDraft({ batchSize: '10' });
  });

  it('normalizes omitted required inputs into typed positions without copying the contract', () => {
    const application = normalizeOperationApplication(completeAll, { note: null });

    expect(application).toEqual({
      kind: 'operation-application',
      operationId: completeAll.id,
      arguments: {
        list: { kind: 'hole', id: 'list' },
        note: { kind: 'value', value: null },
      },
    });
    expect(operationApplicationHoles(application)).toEqual(['list']);
    expect(application).not.toHaveProperty('inputSchema');
  });

  it('keeps an explicit Hole distinct from an omitted optional or defaulted input', () => {
    const application = normalizeOperationApplication(completeAll, {
      list: operationApplicationHole('selectedList'),
      note: null,
      reason: operationApplicationHole('explanation'),
    });

    expect(operationApplicationHoles(application)).toEqual(['selectedList', 'explanation']);
    expect(application.arguments).not.toHaveProperty('batchSize');
  });

  it('validates a substitution against every schema position sharing the named Hole', () => {
    const contract = {
      id: 'Document.rename',
      input: graphSchema.object({
        currentName: field.nonEmptyString({ trim: true }),
        nextName: field.nonEmptyString({ trim: true }),
      }),
    };
    const application = normalizeOperationApplication(contract, {
      currentName: operationApplicationHole('name'),
      nextName: operationApplicationHole('name'),
    });

    expect(substituteOperationApplication(contract, application, 'missing', 'Notes')).toEqual({
      success: false,
      reason: 'unknown-hole',
      holeId: 'missing',
    });
    expect(substituteOperationApplication(contract, application, 'name', '')).toMatchObject({
      success: false,
      reason: 'invalid-substitution',
      holeId: 'name',
      issues: [{ path: ['currentName'] }, { path: ['nextName'] }],
    });
    expect(substituteOperationApplication(contract, application, 'name', '  Notes  ')).toEqual({
      success: true,
      application: {
        ...application,
        arguments: {
          currentName: { kind: 'value', value: '  Notes  ' },
          nextName: { kind: 'value', value: '  Notes  ' },
        },
      },
    });
  });

  it('validates a substitution without applying a transform twice during lowering', () => {
    const contract = {
      id: 'Document.label',
      input: graphSchema.object({
        label: graphSchema.transform(field.string(), value => `${value}!`),
      }),
    };
    const open = normalizeOperationApplication(contract);
    const substitution = substituteOperationApplication(contract, open, 'label', 'draft');
    expect(substitution).toMatchObject({
      success: true,
      application: { arguments: { label: { kind: 'value', value: 'draft' } } },
    });
    if (!substitution.success) return;

    expect(lowerOperationApplication(contract, substitution.application)).toEqual({
      success: true,
      request: {
        kind: 'invoke',
        operationId: contract.id,
        input: { label: 'draft!' },
      },
    });
  });

  it('reports normalization failures and unknown Hole positions as substitution diagnostics', () => {
    const unavailable = {
      id: 'Document.unavailable',
      input: graphSchema.object({
        value: graphSchema.transform(field.string(), () => {
          throw 'unavailable';
        }),
      }),
    };
    const open = normalizeOperationApplication(unavailable);
    expect(substituteOperationApplication(unavailable, open, 'value', 'draft')).toMatchObject({
      success: false,
      reason: 'invalid-substitution',
      issues: [
        {
          code: 'invalid_operation_input',
          path: ['value'],
          message: 'Input does not match the Operation schema.',
        },
      ],
    });

    const unknown = normalizeOperationApplication(completeAll, {
      list: inbox,
      note: null,
      extra: operationApplicationHole('extra'),
    } as never);
    expect(substituteOperationApplication(completeAll, unknown, 'extra', 'value')).toMatchObject({
      success: false,
      reason: 'invalid-substitution',
      issues: [{ code: 'unknown_operation_input', path: ['extra'] }],
    });
  });

  it('cannot lower an open application to an executable request', () => {
    const application = normalizeOperationApplication(completeAll, { note: null });

    expect(lowerOperationApplication(completeAll, application)).toEqual({
      success: false,
      reason: 'open-application',
      holes: ['list'],
    });
  });

  it('cannot substitute or lower an application against another Operation contract', () => {
    const application = normalizeOperationApplication(completeAll, {
      list: operationApplicationHole('list'),
      note: null,
    });
    const other = { ...completeAll, id: 'SemanticProgramTodoList.archive' };

    expect(substituteOperationApplication(other, application, 'list', inbox)).toMatchObject({
      success: false,
      reason: 'invalid-substitution',
      issues: [{ code: 'operation_mismatch' }],
    });
    expect(lowerOperationApplication(other, application)).toMatchObject({
      success: false,
      reason: 'invalid-input',
      issues: [{ code: 'operation_mismatch' }],
    });
  });

  it('lowers a closed application through the existing schema and invocation request', () => {
    const open = normalizeOperationApplication(completeAll, { note: null });
    const substitution = substituteOperationApplication(completeAll, open, 'list', inbox);
    expect(substitution.success).toBe(true);
    if (!substitution.success) return;

    expect(lowerOperationApplication(completeAll, substitution.application)).toEqual({
      success: true,
      request: {
        kind: 'invoke',
        operationId: completeAll.id,
        input: {
          list: inbox,
          note: null,
          batchSize: 25,
        },
      },
    });
  });

  it('leaves complete input validation to the authoritative Operation schema', () => {
    const application = normalizeOperationApplication(completeAll, {
      list: inbox,
      note: null,
      unexpected: true,
    } as never);

    expect(lowerOperationApplication(completeAll, application)).toMatchObject({
      success: false,
      reason: 'invalid-input',
      issues: [{ code: 'unrecognized_keys' }],
    });
  });
});
