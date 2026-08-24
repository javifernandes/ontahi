import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  entity,
  field,
  mutateEntity,
  reaction,
  relationship,
  relationshipSet,
  type AppliedRelationshipMutationOutcome,
  type RelationshipDelta,
} from './index.js';

const defineClassroomGraph = () => {
  const CourseBase = entity('ReactionCourse', { id: field.id() });
  const Student = entity('ReactionStudent', {
    id: field.id(),
    course: field.nullable(field.ref(CourseBase)),
  });
  const Course = CourseBase.hasMany('students', Student, { via: 'course' });
  return { Course, Student };
};

const outcomeFor = (
  command: ReturnType<ReturnType<typeof relationship>['remove']>,
  delta: RelationshipDelta,
): AppliedRelationshipMutationOutcome => ({
  kind: 'applied-mutation-outcome',
  mutationKind: 'relationship-command',
  command,
  delta,
  causality: {
    outcomeId: 'outcome-1',
    rootOutcomeId: 'outcome-1',
    depth: 0,
  },
});

describe('Reaction authoring', () => {
  it('derives one canonical matcher from forward and inverse Relation authoring', () => {
    const { Course, Student } = defineClassroomGraph();
    const config = { id: 'student-removed', delivery: 'inline' } as const;

    const forward = reaction
      .relationship(Student, 'course')
      .removed(config)
      .emit(outcome => ({
        type: 'StudentRemoved',
        student: outcome.command.source,
      }));
    const inverse = reaction.relationship(Course, 'students').removed(config).emit({
      type: 'StudentRemoved',
    });

    expect(forward.when).toEqual(inverse.when);
    expect(inverse).toMatchObject({
      id: 'student-removed',
      delivery: 'inline',
      when: {
        mutationKind: 'relationship-command',
        action: 'unlink',
        relation: {
          sourceEntityName: 'ReactionStudent',
          fieldName: 'course',
          targetEntityName: 'ReactionCourse',
        },
      },
    });
    const student = createEntityRef(Student, { id: 'student-1' });
    const course = createEntityRef(Course, { id: 'course-1' });
    const command = relationship(Student, 'course', student).assign(course);
    expect(forward.react(outcomeFor(command, { added: [], removed: [] }))).toEqual([
      {
        kind: 'emit-event',
        event: { type: 'StudentRemoved', student },
      },
    ]);
  });

  it('authors Event, Operation, and Command intents without low-level intent tags', () => {
    const { Course, Student } = defineClassroomGraph();
    const course = createEntityRef(Course, { id: 'course-1' });
    const student = createEntityRef(Student, { id: 'student-1' });
    const command = relationship(Course, 'students', course).remove(student);
    const delta = {
      added: [],
      removed: [{ relation: command.relation, source: student, target: course }],
    } satisfies RelationshipDelta;
    const declaration = reaction
      .relationship(Course, 'students')
      .removed({ id: 'record-removal', delivery: 'inline' })
      .then(outcome => [
        reaction.intent.emit({ type: 'StudentRemoved', student: outcome.command.source }),
        reaction.intent.invoke('Course.recordRemoval', {
          studentId: outcome.command.source.locator.id,
        }),
        reaction.intent.execute(relationship(Student, 'course', student).clear()),
      ]);

    expect(declaration.react(outcomeFor(command, delta))).toEqual([
      {
        kind: 'emit-event',
        event: { type: 'StudentRemoved', student },
      },
      {
        kind: 'invoke-operation',
        request: {
          kind: 'invoke',
          operationId: 'Course.recordRemoval',
          input: { studentId: 'student-1' },
        },
      },
      {
        kind: 'execute-relationship-command',
        command: relationship(Student, 'course', student).clear(),
      },
    ]);
    expect(reaction.intent.execute(mutateEntity(Student).delete(student))).toEqual({
      kind: 'execute-entity-mutation-command',
      command: mutateEntity(Student).delete(student),
    });
    expect(reaction.intent.invoke({ id: 'Course.inspectRemoval' })).toEqual({
      kind: 'invoke-operation',
      request: { kind: 'invoke', operationId: 'Course.inspectRemoval' },
    });
  });

  it('derives a canonical many-to-many matcher', () => {
    const { Course } = defineClassroomGraph();
    const Club = entity('ReactionClub', { id: field.id() }).manyToMany('courses', Course);
    const declaration = reaction
      .relationship(Club, 'courses')
      .added({ id: 'club-course-added', delivery: 'best-effort' })
      .emit({ type: 'ClubCourseAdded' });
    const club = createEntityRef(Club, { id: 'club-1' });
    const course = createEntityRef(Course, { id: 'course-1' });

    expect(declaration.when).toEqual({
      mutationKind: 'relationship-command',
      action: 'link',
      relation: relationshipSet(Club, 'courses', club).add(course).relation,
    });
  });
});
