import { describe, expect, it, vi } from 'vitest';

import {
  appliedRelationshipCommand,
  createEntityRef,
  createGraphCommandDispatcher,
  createMutationReactionRunner,
  entity,
  field,
  isRelationshipCommandResult,
  mutateEntity,
  notAppliedRelationshipCommand,
  relationship,
  relationshipSet,
  toGraphCommandRequest,
  type DurableMutationReactionEnvelope,
  type MutationReactionIntent,
  type MutationReactionResult,
  type MutationReactionRunner,
  type RelationshipCommand,
  type RelationshipDelta,
} from './index.js';

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
  const Enrollment = entity('Enrollment', {
    id: field.id(),
    student: field.ref(Student),
    course: field.ref(Course),
    status: field.string(),
  });
  return { Course, Enrollment, Mentor, Student };
};

const emptyDelta = (): RelationshipDelta => ({ added: [], removed: [] });
const appliedEmptyDelta = () => appliedRelationshipCommand(emptyDelta());
const runApplied = async (
  runner: MutationReactionRunner,
  command: RelationshipCommand,
): Promise<MutationReactionResult> => {
  const result = await runner(command);
  if ('status' in result) throw new Error('Expected an applied Relationship Command.');
  return result;
};

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
        return appliedEmptyDelta();
      },
      reactions: [
        {
          id: 'assign-mentor-course',
          delivery: 'inline',
          when: {
            mutationKind: 'relationship-command',
            action: 'link',
            relation: parent.relation,
          },
          react: () => [{ kind: 'execute-relationship-command', command: followUp }],
        },
      ],
    });

    const result = await runApplied(run, parent);

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
        delivery: 'inline',
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
      execute: async () => appliedEmptyDelta(),
    });
    const execute = vi.fn(async (command: RelationshipCommand) => {
      const response = await dispatch(toGraphCommandRequest(command), { authority: 'system' });
      if (response.kind === 'protocol-error') throw new Error(response.error.code);
      if (response.kind === 'graph-command-rejection') {
        throw new Error(response.diagnostic.rejection.code);
      }
      if (!isRelationshipCommandResult(response.value)) {
        throw new Error('Expected a Relationship Command result.');
      }
      return response.value;
    });
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'parent-outcome',
      executeRelationshipCommand: execute,
      reactions: [
        {
          id: 'clear-after-assign',
          delivery: 'inline',
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

    const result = await runApplied(run, parent);

    expect(result.root.command).toEqual(parent);
    expect(result.reactions).toEqual([
      expect.objectContaining({
        status: 'failed',
        failure: {
          code: 'follow_up_failed',
          message: 'Post-commit follow-up intent failed.',
        },
      }),
    ]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('records a skipped follow-up without creating a child Applied Mutation Outcome', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const skipped = relationship(graph.Student, 'course', student).assign(course, {
      ifCurrent: createEntityRef(graph.Course, { id: 'course-2' }),
      onMismatch: 'skip',
    });
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'parent-outcome',
      executeRelationshipCommand: async command =>
        command === skipped ? notAppliedRelationshipCommand(command) : appliedEmptyDelta(),
      reactions: [
        {
          id: 'conditional-follow-up',
          delivery: 'inline',
          when: { mutationKind: 'relationship-command', relation: parent.relation },
          react: outcome =>
            outcome.command === parent
              ? [{ kind: 'execute-relationship-command', command: skipped }]
              : [],
        },
      ],
    });

    const result = await runApplied(run, parent);

    expect(result.reactions).toEqual([
      expect.objectContaining({
        reactionId: 'conditional-follow-up',
        status: 'not-applied',
        diagnostic: expect.objectContaining({ reason: 'relationship_precondition_failed' }),
      }),
    ]);
  });

  it('reports Reaction evaluation failure without hiding the applied parent', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'outcome-1',
      executeRelationshipCommand: async () => appliedEmptyDelta(),
      reactions: [
        {
          id: 'broken-reaction',
          delivery: 'inline',
          when: { mutationKind: 'relationship-command' },
          react: () => {
            throw new Error('application secret');
          },
        },
      ],
    });

    const result = await runApplied(run, parent);

    expect(result.root.command).toEqual(parent);
    expect(result.reactions).toEqual([
      {
        reactionId: 'broken-reaction',
        reactionKey: 'broken-reaction:outcome-1',
        sourceOutcomeId: 'outcome-1',
        delivery: 'inline',
        status: 'failed',
        failure: {
          code: 'reaction_failed',
          message: 'Post-commit Reaction evaluation failed.',
        },
      },
    ]);
  });

  it('rejects every malformed follow-up intent before interpreting any of them', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const executeRelationshipCommand = vi.fn(async () => appliedEmptyDelta());
    const emitEvent = vi.fn(async () => undefined);
    const malformedIntents = [
      { kind: 'emit-event', event: { type: 'must-not-be-emitted' } },
      { kind: 'unknown' },
    ] as unknown as readonly MutationReactionIntent[];
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'outcome-1',
      executeRelationshipCommand,
      emitEvent,
      reactions: [
        {
          id: 'malformed-reaction',
          delivery: 'inline',
          when: { mutationKind: 'relationship-command' },
          react: () => malformedIntents,
        },
      ],
    });

    const result = await runApplied(run, parent);

    expect(executeRelationshipCommand).toHaveBeenCalledOnce();
    expect(emitEvent).not.toHaveBeenCalled();
    expect(result.reactions).toEqual([
      {
        reactionId: 'malformed-reaction',
        reactionKey: 'malformed-reaction:outcome-1',
        sourceOutcomeId: 'outcome-1',
        delivery: 'inline',
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
    const execute = vi.fn(async () => appliedEmptyDelta());
    const run = createMutationReactionRunner({
      createOutcomeId: () => `outcome-${++nextId}`,
      executeRelationshipCommand: execute,
      maxDepth: 1,
      reactions: [
        {
          id: 'toggle-course',
          delivery: 'inline',
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

    const result = await runApplied(run, assign);

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

  it('durably accepts a serializable follow-up without executing it inline', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const mentor = createEntityRef(graph.Mentor, { id: 'mentor-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const followUp = relationship(graph.Mentor, 'course', mentor).assign(course);
    const execute = vi.fn(async () => appliedEmptyDelta());
    const acceptDurableReaction = vi.fn(async (_envelope: DurableMutationReactionEnvelope) => ({
      acceptanceId: 'accepted-1',
    }));
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'outcome-1',
      executeRelationshipCommand: execute,
      acceptDurableReaction,
      reactions: [
        {
          id: 'durable-mentor-assignment',
          delivery: 'durable',
          when: { mutationKind: 'relationship-command', relation: parent.relation },
          react: () => [{ kind: 'execute-relationship-command', command: followUp }],
        },
      ],
    });

    const result = await runApplied(run, parent);

    expect(execute).toHaveBeenCalledOnce();
    expect(acceptDurableReaction).toHaveBeenCalledWith({
      kind: 'durable-mutation-reaction',
      reactionId: 'durable-mentor-assignment',
      reactionKey: 'durable-mentor-assignment:outcome-1:0',
      source: result.root,
      intent: { kind: 'execute-relationship-command', command: followUp },
    });
    expect(JSON.parse(JSON.stringify(acceptDurableReaction.mock.calls[0]?.[0]))).toEqual(
      acceptDurableReaction.mock.calls[0]?.[0],
    );
    expect(result.reactions).toEqual([
      expect.objectContaining({
        delivery: 'durable',
        status: 'accepted',
        acceptance: { acceptanceId: 'accepted-1' },
      }),
    ]);
  });

  it('reports missing durable acceptance separately from the applied parent', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'outcome-1',
      executeRelationshipCommand: async () => appliedEmptyDelta(),
      reactions: [
        {
          id: 'durable-clear',
          delivery: 'durable',
          when: { mutationKind: 'relationship-command' },
          react: () => [
            {
              kind: 'execute-relationship-command',
              command: relationship(graph.Student, 'course', student).clear(),
            },
          ],
        },
      ],
    });

    const result = await runApplied(run, parent);

    expect(result.root.command).toEqual(parent);
    expect(result.reactions).toEqual([
      expect.objectContaining({
        delivery: 'durable',
        status: 'failed',
        failure: {
          code: 'durable_acceptance_unavailable',
          message: 'Durable Mutation Reaction acceptance is unavailable.',
        },
      }),
    ]);
  });

  it('interprets Operation invocations and Events as explicit follow-up intents', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const invokeOperation = vi.fn(async () => ({ ok: true, value: { notified: true } }));
    const emitEvent = vi.fn(async () => undefined);
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'outcome-1',
      executeRelationshipCommand: async () => appliedEmptyDelta(),
      invokeOperation,
      emitEvent,
      reactions: [
        {
          id: 'announce-course-assignment',
          delivery: 'inline',
          when: { mutationKind: 'relationship-command', action: 'link' },
          react: outcome =>
            outcome.mutationKind === 'relationship-command' &&
            outcome.command.kind === 'relationship-command'
              ? [
                  {
                    kind: 'invoke-operation',
                    request: {
                      kind: 'invoke',
                      operationId: 'School.notifyCourseAssignment',
                      input: {
                        student: outcome.command.source,
                        course: outcome.command.target,
                      },
                    },
                  },
                  {
                    kind: 'emit-event',
                    event: {
                      type: 'student.course-assigned',
                      student: outcome.command.source,
                    },
                  },
                ]
              : [],
        },
      ],
    });

    const result = await runApplied(run, parent);

    expect(invokeOperation).toHaveBeenCalledWith({
      kind: 'invoke',
      operationId: 'School.notifyCourseAssignment',
      input: { student, course },
    });
    expect(emitEvent).toHaveBeenCalledWith({ type: 'student.course-assigned', student });
    expect(result.reactions).toEqual([
      expect.objectContaining({
        intentIndex: 0,
        status: 'completed',
        result: { ok: true, value: { notified: true } },
      }),
      expect.objectContaining({ intentIndex: 1, status: 'emitted' }),
    ]);
  });

  it('rejects non-serializable durable intents before acceptance', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const acceptDurableReaction = vi.fn();
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'outcome-1',
      executeRelationshipCommand: async () => appliedEmptyDelta(),
      acceptDurableReaction,
      reactions: [
        {
          id: 'invalid-durable-event',
          delivery: 'durable',
          when: { mutationKind: 'relationship-command' },
          react: () => [{ kind: 'emit-event', event: { callback: () => undefined } }],
        },
      ],
    });

    const result = await runApplied(run, parent);

    expect(acceptDurableReaction).not.toHaveBeenCalled();
    expect(result.reactions).toEqual([
      expect.objectContaining({
        status: 'failed',
        failure: {
          code: 'durable_intent_not_serializable',
          message: 'Durable Mutation Reaction intent must be serializable.',
        },
      }),
    ]);
  });

  it('creates an Association Entity and reacts to its own applied outcome', async () => {
    const graph = defineSchoolGraph();
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const enrollment = createEntityRef(graph.Enrollment, { id: 'enrollment-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const createEnrollment = mutateEntity(graph.Enrollment).create({
      id: 'enrollment-1',
      student,
      course,
      status: 'active',
    });
    const emitEvent = vi.fn(async () => undefined);
    let nextId = 0;
    const run = createMutationReactionRunner({
      createOutcomeId: () => `outcome-${++nextId}`,
      executeRelationshipCommand: async () => appliedEmptyDelta(),
      executeEntityMutationCommand: async command => ({
        created: [
          {
            entityName: command.entityName,
            ref: enrollment,
            values: command.action === 'delete' ? {} : command.values,
          },
        ],
        updated: [],
        deleted: [],
      }),
      emitEvent,
      reactions: [
        {
          id: 'create-enrollment',
          delivery: 'inline',
          when: { mutationKind: 'relationship-command', action: 'link' },
          react: () => [{ kind: 'execute-entity-mutation-command', command: createEnrollment }],
        },
        {
          id: 'announce-enrollment',
          delivery: 'inline',
          when: {
            mutationKind: 'entity-mutation-command',
            action: 'create',
            entityName: 'Enrollment',
          },
          react: outcome => [
            {
              kind: 'emit-event',
              event: {
                type: 'enrollment.created',
                enrollment:
                  outcome.mutationKind === 'entity-mutation-command'
                    ? outcome.delta.created[0]?.ref
                    : undefined,
              },
            },
          ],
        },
      ],
    });

    const result = await runApplied(run, parent);

    expect(result.reactions).toEqual([
      expect.objectContaining({
        reactionId: 'create-enrollment',
        status: 'applied',
        outcome: expect.objectContaining({
          mutationKind: 'entity-mutation-command',
          command: createEnrollment,
          causality: expect.objectContaining({
            rootOutcomeId: 'outcome-1',
            parentOutcomeId: 'outcome-1',
            depth: 1,
          }),
        }),
      }),
      expect.objectContaining({ reactionId: 'announce-enrollment', status: 'emitted' }),
    ]);
    expect(emitEvent).toHaveBeenCalledWith({
      type: 'enrollment.created',
      enrollment,
    });
  });

  it('preserves a many-to-many delta as a child Applied Mutation Outcome', async () => {
    const graph = defineSchoolGraph();
    const Todo = entity('Todo', { id: field.id() }).manyToMany('courses', graph.Course);
    const student = createEntityRef(graph.Student, { id: 'student-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const todo = createEntityRef(Todo, { id: 'todo-1' });
    const parent = relationship(graph.Student, 'course', student).assign(course);
    const followUp = relationshipSet(Todo, 'courses', todo).add(course);
    let nextId = 0;
    const run = createMutationReactionRunner({
      createOutcomeId: () => `outcome-${++nextId}`,
      executeRelationshipCommand: async () => appliedEmptyDelta(),
      executeManyToManyRelationshipCommand: async command =>
        appliedRelationshipCommand({
          added: [
            {
              relation: command.relation,
              source: todo,
              target: course,
            },
          ],
          removed: [],
        }),
      reactions: [
        {
          id: 'relate-todo-course',
          delivery: 'inline',
          when: { mutationKind: 'relationship-command', relation: parent.relation },
          react: () => [{ kind: 'execute-many-to-many-relationship-command', command: followUp }],
        },
      ],
    });

    const result = await runApplied(run, parent);

    expect(result.reactions).toEqual([
      expect.objectContaining({
        status: 'applied',
        outcome: expect.objectContaining({
          mutationKind: 'relationship-command',
          command: followUp,
          delta: {
            added: [{ relation: followUp.relation, source: todo, target: course }],
            removed: [],
          },
          causality: expect.objectContaining({ depth: 1, rootOutcomeId: 'outcome-1' }),
        }),
      }),
    ]);
  });

  it('observes an already-applied many-to-many root without executing it again', async () => {
    const graph = defineSchoolGraph();
    const Club = entity('AppliedClub', { id: field.id() }).manyToMany('courses', graph.Course);
    const club = createEntityRef(Club, { id: 'club-1' });
    const course = createEntityRef(graph.Course, { id: 'course-1' });
    const command = relationshipSet(Club, 'courses', club).remove(course);
    const delta = {
      added: [],
      removed: [{ relation: command.relation, source: club, target: course }],
    } satisfies RelationshipDelta;
    const executeRelationshipCommand = vi.fn(async () => appliedEmptyDelta());
    const executeManyToManyRelationshipCommand = vi.fn(async () => appliedEmptyDelta());
    const run = createMutationReactionRunner({
      createOutcomeId: () => 'outcome-applied',
      executeRelationshipCommand,
      executeManyToManyRelationshipCommand,
      reactions: [],
    });

    const result = await run.applied(command, delta);

    expect(executeRelationshipCommand).not.toHaveBeenCalled();
    expect(executeManyToManyRelationshipCommand).not.toHaveBeenCalled();
    expect(result).toEqual({
      root: {
        kind: 'applied-mutation-outcome',
        mutationKind: 'relationship-command',
        command,
        delta,
        causality: {
          outcomeId: 'outcome-applied',
          rootOutcomeId: 'outcome-applied',
          depth: 0,
        },
      },
      reactions: [],
    });
  });
});
