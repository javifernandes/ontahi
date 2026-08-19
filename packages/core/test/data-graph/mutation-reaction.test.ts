import { describe, expect, it, vi } from 'vitest';

import {
  createEntityRef,
  createGraphCommandDispatcher,
  createMutationReactionRunner,
  entity,
  field,
  relationship,
  toGraphCommandRequest,
  type RelationshipCommand,
  type RelationshipDelta,
} from '../../src/data-graph/index.js';

const defineSchoolGraph = () => {
  const Course = entity('Course', { id: field.id() });
  const Student = entity('Student', {
    id: field.id(),
    course: field.nullable(field.ref(Course)),
  });
  const Mentor = entity('Mentor', {
    id: field.id(),
    course: field.nullable(field.ref(Course)),
  });
  return { Course, Mentor, Student };
};

const emptyDelta = (): RelationshipDelta => ({ added: [], removed: [] });

describe('Applied Mutation Outcomes and Reactions', () => {
  it('runs declared follow-up commands after the parent is applied and preserves causality', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const mentor = createEntityRef(graph.Mentor, { id: 'mentor-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const followUp = relationship(graph.Mentor, 'course', mentor).assign(course);
    const applied: RelationshipCommand[] = [];
    const run = createMutationReactionRunner({
      createOutcomeId: (() => {
        let next = 0;
        return () => `outcome-${++next}`;
      })(),
      executeRelationshipCommand: async command => {
        applied.push(command);
        return emptyDelta();
      },
      reactions: [
        {
          id: 'assign-mentor-course',
          when: {
            mutationKind: 'relationship-command',
            action: 'link',
            relation: parent.relation,
          },
          react: () => [{ kind: 'execute-relationship-command', command: followUp }],
        },
      ],
    });

    const result = await run(parent);

    expect(applied).toEqual([parent, followUp]);
    expect(result.root).toMatchObject({
      kind: 'applied-mutation-outcome',
      mutationKind: 'relationship-command',
      command: parent,
      causality: { outcomeId: 'outcome-1', rootOutcomeId: 'outcome-1', depth: 0 },
    });
    expect(result.reactions).toEqual([
      {
        reactionId: 'assign-mentor-course',
        reactionKey: 'assign-mentor-course:outcome-1:0',
        sourceOutcomeId: 'outcome-1',
        intentIndex: 0,
        status: 'applied',
        outcome: expect.objectContaining({
          command: followUp,
          causality: {
            outcomeId: 'outcome-2',
            rootOutcomeId: 'outcome-1',
            parentOutcomeId: 'outcome-1',
            depth: 1,
          },
        }),
      },
    ]);
  });

  it('keeps the parent applied when a post-commit follow-up is denied', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const dispatch = createGraphCommandDispatcher({
      policies: [{ entity: graph.Student, fieldName: 'course', actions: ['link'] }],
      execute: async () => emptyDelta(),
    });
    const execute = vi.fn(async (command: RelationshipCommand) => {
      const response = await dispatch(toGraphCommandRequest(command), { authority: 'system' });
      if (response.kind === 'protocol-error') throw new Error(response.error.code);
      return response.value;
    });
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'parent-outcome',
      executeRelationshipCommand: execute,
      reactions: [
        {
          id: 'clear-after-assign',
          when: { mutationKind: 'relationship-command', action: 'link' },
          react: () => [
            {
              kind: 'execute-relationship-command',
              command: relationship(graph.Student, 'course', student).clear(),
            },
          ],
        },
      ],
    });

    const result = await run(parent);

    expect(result.root.command).toEqual(parent);
    expect(result.reactions).toEqual([
      expect.objectContaining({
        status: 'failed',
        failure: {
          code: 'follow_up_failed',
          message: 'Post-commit Relationship Command failed.',
        },
      }),
    ]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('reports Reaction evaluation failure without hiding the applied parent', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'outcome-1',
      executeRelationshipCommand: async () => emptyDelta(),
      reactions: [
        {
          id: 'broken-reaction',
          when: { mutationKind: 'relationship-command' },
          react: () => {
            throw new Error('application secret');
          },
        },
      ],
    });

    const result = await run(parent);

    expect(result.root.command).toEqual(parent);
    expect(result.reactions).toEqual([
      {
        reactionId: 'broken-reaction',
        reactionKey: 'broken-reaction:outcome-1',
        sourceOutcomeId: 'outcome-1',
        status: 'failed',
        failure: {
          code: 'reaction_failed',
          message: 'Post-commit Reaction evaluation failed.',
        },
      },
    ]);
  });

  it('stops recursive reaction chains at the declared maximum depth', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const assign = relationship(graph.Student, 'course', student).assign(course);
    const clear = relationship(graph.Student, 'course', student).clear();
    let nextId = 0;
    const execute = vi.fn(async () => emptyDelta());
    const run = createMutationReactionRunner({
      createOutcomeId: () => `outcome-${++nextId}`,
      executeRelationshipCommand: execute,
      maxDepth: 1,
      reactions: [
        {
          id: 'toggle-course',
          when: { mutationKind: 'relationship-command' },
          react: outcome => [
            {
              kind: 'execute-relationship-command',
              command: outcome.command.action === 'link' ? clear : assign,
            },
          ],
        },
      ],
    });

    const result = await run(assign);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.reactions.map(reaction => reaction.status)).toEqual([
      'applied',
      'depth-exceeded',
    ]);
    expect(result.reactions[1]).toMatchObject({
      failure: {
        code: 'max_depth_exceeded',
        message: 'Post-commit Reaction exceeded maximum depth 1.',
      },
    });
  });
});
