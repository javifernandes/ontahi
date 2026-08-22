import { describe, expect, it } from 'vitest';

import { entity, field, relationConstraint } from '../../src/data-graph/index.js';

describe('Relation constraint authoring', () => {
  const Todo = entity('ConstraintTodo', {
    id: field.id(),
    completed: field.boolean(),
  });

  it('builds the portable contract through a typed participant factory', () => {
    expect(
      relationConstraint.source(Todo, todo => todo.completed.eq(false), {
        code: 'completed_todo_cannot_be_tagged',
        message: 'Completed todos cannot be tagged.',
      }),
    ).toEqual({
      kind: 'participant-selection',
      participant: 'source',
      selection: {
        kind: 'predicate',
        operator: 'eq',
        fieldName: 'completed',
        value: false,
      },
      rejection: {
        version: 1,
        code: 'completed_todo_cannot_be_tagged',
        message: 'Completed todos cannot be tagged.',
      },
    });
  });

  it('rejects builder output that is not portable', () => {
    const Dated = entity('DatedParticipant', { id: field.id(), occurredAt: field.date() });

    expect(() =>
      relationConstraint.target(Dated, participant => participant.occurredAt.eq(new Date()), {
        code: 'invalid_date',
        message: 'Date is not portable.',
      }),
    ).toThrow('Relation constraints must be JSON-safe.');
  });
});
