import { describe, expect, it } from 'vitest';

import {
  entity,
  field,
  relationConstraint,
  resolveDirectRelationConstraints,
  resolveManyToManyRelationConstraints,
} from './index.js';

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

  it('resolves declaration-relative participants into canonical direct endpoints', () => {
    const Course = entity('ConstraintCourse', {
      id: field.id(),
      open: field.boolean(),
    });
    const Student = entity('ConstraintStudent', {
      id: field.id(),
      active: field.boolean(),
      course: field.nullable(field.ref(Course)),
    });
    Student.belongsTo('course', Course, {
      via: 'course',
      constraints: [
        relationConstraint.source(Student, student => student.active.eq(true), {
          code: 'inactive_student',
          message: 'Only active students may join.',
        }),
      ],
    });
    Course.hasMany('students', Student, {
      constraints: [
        relationConstraint.source(Course, course => course.open.eq(true), {
          code: 'closed_course',
          message: 'Only open courses accept students.',
        }),
        relationConstraint.target(Student, student => student.active.eq(true), {
          code: 'inactive_inverse_student',
          message: 'Only active students may join through the inverse.',
        }),
      ],
    });

    expect(
      resolveDirectRelationConstraints(
        {
          sourceEntityName: Student.name,
          fieldName: 'course',
          targetEntityName: Course.name,
        },
        Student,
        Course,
      ).map(resolved => ({
        participant: resolved.participant,
        entityName: resolved.entity.name,
        code: resolved.rejection.code,
      })),
    ).toEqual([
      {
        participant: 'source',
        entityName: 'ConstraintStudent',
        code: 'inactive_student',
      },
      {
        participant: 'target',
        entityName: 'ConstraintCourse',
        code: 'closed_course',
      },
      {
        participant: 'source',
        entityName: 'ConstraintStudent',
        code: 'inactive_inverse_student',
      },
    ]);
  });

  it('visits a self-referential direct Relation only once', () => {
    const Node = entity('ConstraintNode', {
      id: field.id(),
      active: field.boolean(),
    });
    Node.belongsTo('parent', Node, {
      constraints: [
        relationConstraint.source(Node, node => node.active.eq(true), {
          code: 'inactive_node',
          message: 'Only active nodes may be linked.',
          parameters: { participant: 'source' },
        }),
      ],
    });

    const resolved = resolveDirectRelationConstraints(
      {
        sourceEntityName: Node.name,
        fieldName: 'parent',
        targetEntityName: Node.name,
      },
      Node,
      Node,
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      participant: 'source',
      entity: Node,
      rejection: {
        code: 'inactive_node',
        parameters: { participant: 'source' },
      },
    });
  });

  it('resolves many-to-many participants through one Core contract', () => {
    const Tag = entity('ConstraintTag', { id: field.id(), assignable: field.boolean() });
    const TodoDefinition = entity('ConstraintManyTodo', {
      id: field.id(),
      completed: field.boolean(),
    });
    const Todo = TodoDefinition.manyToMany('tags', Tag, {
      constraints: [
        relationConstraint.source(TodoDefinition, todo => todo.completed.eq(false), {
          code: 'completed_todo',
          message: 'Completed todos cannot be tagged.',
        }),
        relationConstraint.target(Tag, tag => tag.assignable.eq(true), {
          code: 'unassignable_tag',
          message: 'Tag is not assignable.',
        }),
      ],
    });

    expect(resolveManyToManyRelationConstraints(Todo.relations.tags, Todo, Tag)).toMatchObject([
      { participant: 'source', entity: Todo, rejection: { code: 'completed_todo' } },
      { participant: 'target', entity: Tag, rejection: { code: 'unassignable_tag' } },
    ]);
  });
});
