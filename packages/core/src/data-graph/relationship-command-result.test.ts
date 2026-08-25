import { describe, expect, it } from 'vitest';

import {
  appliedRelationshipCommand,
  createEntityRef,
  entity,
  field,
  isRelationshipCommandResult,
  relationship,
  relationshipCommandDiagnosticFromError,
  relationshipConstraintDiagnostic,
} from './index.js';

const defineSchoolGraph = () => {
  const Course = entity('ResultCourse', { id: field.id() });
  const Student = entity('ResultStudent', {
    id: field.id(),
    course: field.nullable(field.ref(Course)),
  });
  return { Course, Student };
};

describe('Relationship Command results', () => {
  it('validates applied exact deltas and rejects malformed result facts', () => {
    const graph = defineSchoolGraph();
    const target = createEntityRef(graph.Course, { id: 'course-1' });
    const command = relationship(
      graph.Student,
      'course',
      createEntityRef(graph.Student, { id: 'student-1' }),
    ).assign(target);
    const result = appliedRelationshipCommand({
      added: [
        {
          relation: command.relation,
          source: command.source,
          target,
        },
      ],
      removed: [],
    });

    expect(isRelationshipCommandResult(result)).toBe(true);
    expect(
      isRelationshipCommandResult({
        status: 'applied',
        delta: { added: [{ relation: command.relation }], removed: [] },
      }),
    ).toBe(false);
  });

  it('extracts only canonical safe diagnostics from nested provider failures', () => {
    const graph = defineSchoolGraph();
    const command = relationship(
      graph.Student,
      'course',
      createEntityRef(graph.Student, { id: 'student-1' }),
    ).assign(createEntityRef(graph.Course, { id: 'course-2' }), {
      ifCurrent: createEntityRef(graph.Course, { id: 'course-1' }),
    });
    const rejection = {
      version: 1 as const,
      code: 'course_closed',
      message: 'This course is closed.',
      parameters: { status: 'closed' },
    };
    const wrapper: Record<PropertyKey, unknown> = {
      provider: { reason: 'relation_constraint_rejected', rejection },
    };
    wrapper.self = wrapper;

    expect(relationshipCommandDiagnosticFromError(wrapper, command)).toEqual(
      relationshipConstraintDiagnostic(rejection),
    );
    expect(
      relationshipCommandDiagnosticFromError(
        { cause: { reason: 'relationship_precondition_failed' } },
        command,
      ),
    ).toMatchObject({
      reason: 'relationship_precondition_failed',
      rejection: { code: 'relationship_precondition_failed' },
    });
    expect(
      relationshipCommandDiagnosticFromError(
        { reason: 'relation_constraint_rejected', rejection: { ...rejection, version: 2 } },
        command,
      ),
    ).toBeUndefined();
  });
});
