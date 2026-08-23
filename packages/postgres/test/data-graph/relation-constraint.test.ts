import {
  Selection,
  entity,
  field,
  selection,
  type PortableSelectionExpression,
  type RelationConstraintRejection,
  type SelectionExpression,
} from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import type { PostgresEntityMapping } from '../../src/data-graph/mapping.js';
import { postgresMapping } from '../../src/data-graph/mapping.js';
import { compilePostgresRelationConstraints } from '../../src/data-graph/relation-constraint.js';

const Candidate = entity('ConstraintCandidate', {
  id: field.id(),
  score: field.nullable(field.integer()),
  note: field.nullable(field.string()),
});

const candidateMapping = postgresMapping({
  entity: Candidate,
  table: 'constraint_candidates',
  columns: { id: 'candidate_id', score: 'candidate_score', note: 'candidate_note' },
});

const rejected: RelationConstraintRejection = {
  version: 1,
  code: 'candidate_rejected',
  message: 'Candidate rejected.',
};

const portable = (expression: SelectionExpression) => expression as PortableSelectionExpression;

const compile = (expression: PortableSelectionExpression) => {
  const values: unknown[] = [];
  const compiled = compilePostgresRelationConstraints(
    [{ participant: 'source', selection: expression, rejection: rejected }],
    candidateMapping,
    candidateMapping,
    values,
  );
  return { compiled, values };
};

describe('PostgreSQL Relation constraint compiler', () => {
  it('keeps boolean composition total when nullable columns participate', () => {
    const expression = selection(Candidate, candidate => candidate.score.in([1, 2]))
      .or(candidate => candidate.note.isNull())
      .and(selection(Candidate, candidate => candidate.score.gte(2)).not())
      .build();
    const { compiled, values } = compile(portable(expression));

    expect(compiled.sourceProjection).toHaveLength(1);
    expect(compiled.targetProjection).toEqual([]);
    expect(compiled.sourceProjection[0]).toContain('IS NOT DISTINCT FROM');
    expect(compiled.sourceProjection[0]).toContain('IS NULL');
    expect(compiled.sourceProjection[0]).toContain('COALESCE');
    expect(compiled.sourceProjection[0]).toContain('NOT');
    expect(compiled.stateProjection).toHaveLength(1);
    expect(compiled.rejectionExpression).toContain('WHEN NOT');
    expect(values).toEqual([1, 2, 2, rejected]);
  });

  it('preserves total all, none, and empty-in identities', () => {
    expect(
      compile(portable(Selection.all(Candidate).build())).compiled.sourceProjection[0],
    ).toContain('TRUE');
    expect(
      compile(portable(Selection.none(Candidate).build())).compiled.sourceProjection[0],
    ).toContain('FALSE');
    expect(
      compile(portable(selection(Candidate, candidate => candidate.score.in([])).build())).compiled
        .sourceProjection[0],
    ).toContain('FALSE');
  });

  it.each([
    ['lt', '<'],
    ['lte', '<='],
    ['gt', '>'],
    ['gte', '>='],
  ] as const)('compiles %s as a nullable-safe comparison', (operator, sqlOperator) => {
    const { compiled } = compile({
      kind: 'predicate',
      operator,
      fieldName: 'score',
      value: 2,
    });

    expect(compiled.sourceProjection[0]).toContain(
      `COALESCE("candidate_score" ${sqlOperator} $1, FALSE)`,
    );
  });

  it('fails closed when a constraint field is not mapped', () => {
    const incompleteMapping = {
      ...candidateMapping,
      columns: { id: 'candidate_id', note: 'candidate_note' },
    } as unknown as PostgresEntityMapping;

    expect(() =>
      compilePostgresRelationConstraints(
        [
          {
            participant: 'source',
            selection: portable(selection(Candidate, candidate => candidate.score.eq(2)).build()),
            rejection: rejected,
          },
        ],
        incompleteMapping,
        candidateMapping,
        [],
      ),
    ).toThrow('ConstraintCandidate.score is not mapped');
  });
});
