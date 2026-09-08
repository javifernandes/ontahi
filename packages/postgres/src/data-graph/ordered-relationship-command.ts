import {
  createEntityIdentityRef,
  getEntityIdentityLocator,
  isReferenceFieldDefinition,
  selectionReferences,
  type AnyEntityRef,
  type OrderedRelationshipCommand,
  type OrderedRelationshipPosition,
  type RelationshipCommandResult,
} from '@ontahi/core/data-graph';
import type { QueryResult, QueryResultRow } from 'pg';

import type { PostgresEntityMapping } from './mapping.js';
import { PostgresDataGraphError } from './runtime-error.js';
import { compilePostgresSelection, quotePostgresIdentifier } from './sql.js';

type ExecuteQuery = <TRow extends QueryResultRow>(sql: {
  text: string;
  values: unknown[];
}) => Promise<QueryResult<TRow>>;

type OrderedMemberRow = QueryResultRow & {
  row_token: string;
  source_value: unknown;
  [identity: `identity_${number}`]: unknown;
};

const reject = (code: string, message: string): never => {
  throw new PostgresDataGraphError(message, 'ordered_relationship_rejected', undefined, {
    version: 1,
    code,
    message,
  });
};

const positionsEqual = (
  left: { before: string | null; after: string | null },
  right: { before: string | null; after: string | null },
) => left.before === right.before && left.after === right.after;

export const executePostgresOrderedRelationshipCommand = async (input: {
  command: OrderedRelationshipCommand;
  executeQuery: ExecuteQuery;
  mappings: readonly PostgresEntityMapping[];
  authoritySerialized?: boolean;
}): Promise<RelationshipCommandResult> => {
  if (!input.authoritySerialized) {
    throw new PostgresDataGraphError(
      'PostgreSQL ordered Relationship Command requires a transaction.',
      'execution_failed',
    );
  }
  const { command } = input;
  const sourceMapping = input.mappings.find(
    mapping => mapping.entity.name === command.relation.sourceEntityName,
  );
  const targetMapping = input.mappings.find(
    mapping => mapping.entity.name === command.relation.targetEntityName,
  );
  if (!sourceMapping || !targetMapping) {
    throw new PostgresDataGraphError(
      'PostgreSQL ordered Relationship Command references an unmapped Entity.',
      'invalid_command',
    );
  }
  const relation = sourceMapping.entity.relations[command.relation.relationName];
  const relationMapping = relation?.mapping;
  const targetField = relation?.targetField
    ? targetMapping.entity.fields[relation.targetField]
    : undefined;
  if (
    !relation ||
    relation.relationKind !== 'hasMany' ||
    !relation.ordered ||
    relation.target !== targetMapping.entity ||
    !relation.targetField ||
    !targetField ||
    !isReferenceFieldDefinition(targetField) ||
    targetField.target !== sourceMapping.entity ||
    targetField.nullable ||
    targetField.optional ||
    !relationMapping ||
    relationMapping.type !== 'one-to-many' ||
    !relationMapping.orderColumn
  ) {
    throw new PostgresDataGraphError(
      'PostgreSQL ordered Relationship Command does not reference a mapped ordered Relation.',
      'invalid_command',
    );
  }
  const sourceField = Object.entries(sourceMapping.columns).find(
    ([, column]) => column === relationMapping.fromColumn,
  )?.[0];
  const identity = getEntityIdentityLocator(targetMapping.entity);
  const identityFields = identity?.locator.fields;
  if (!sourceField || !identityFields || identityFields.length === 0) {
    throw new PostgresDataGraphError(
      'PostgreSQL ordered Relationship Command requires mapped source and target identities.',
      'invalid_command',
    );
  }

  const sourceValues: unknown[] = [];
  const sourceWhere = compilePostgresSelection(
    selectionReferences([command.source]),
    sourceMapping,
    sourceValues,
  );
  const sourceResult = await input.executeQuery<QueryResultRow & { source_value: unknown }>({
    text:
      `SELECT ${quotePostgresIdentifier(relationMapping.fromColumn)} AS source_value ` +
      `FROM ${quotePostgresIdentifier(sourceMapping.table)} WHERE ${sourceWhere} FOR UPDATE`,
    values: sourceValues,
  });
  if (sourceResult.rows.length === 0) {
    reject('ordered_relationship_source_not_found', 'Ordered Relationship source was not found.');
  }
  if (sourceResult.rows.length !== 1) {
    throw new PostgresDataGraphError(
      'PostgreSQL ordered Relationship source Ref did not resolve exactly once.',
      'cardinality_mismatch',
    );
  }
  const sourceValue = sourceResult.rows[0]!.source_value;

  const targetTable = quotePostgresIdentifier(targetMapping.table);
  const relationColumn = quotePostgresIdentifier(relationMapping.toColumn);
  const resolveTarget = async (ref: AnyEntityRef, role: 'member' | 'anchor' | 'neighbor') => {
    const values: unknown[] = [];
    const where = compilePostgresSelection(selectionReferences([ref]), targetMapping, values);
    const result = await input.executeQuery<
      QueryResultRow & { row_token: string; source_value: unknown }
    >({
      text:
        `SELECT ctid::text AS row_token, ${relationColumn} AS source_value ` +
        `FROM ${targetTable} WHERE ${where} FOR UPDATE`,
      values,
    });
    if (result.rows.length === 0) {
      reject(
        `ordered_relationship_${role}_not_found`,
        `Ordered Relationship ${role} was not found.`,
      );
    }
    if (result.rows.length !== 1) {
      throw new PostgresDataGraphError(
        `PostgreSQL ordered Relationship ${role} Ref did not resolve exactly once.`,
        'cardinality_mismatch',
      );
    }
    const row = result.rows[0]!;
    if (row.source_value !== sourceValue) {
      reject(
        `ordered_relationship_${role}_not_in_relation`,
        `Ordered Relationship ${role} is not a member of the source Relation.`,
      );
    }
    return row.row_token;
  };

  const memberToken = await resolveTarget(command.member, 'member');
  const placementAnchor =
    'before' in command.position
      ? command.position.before
      : 'after' in command.position
        ? command.position.after
        : undefined;
  const placementAnchorToken = placementAnchor
    ? await resolveTarget(placementAnchor, 'anchor')
    : undefined;
  const expectedBeforeToken = command.precondition?.position.before
    ? await resolveTarget(command.precondition.position.before, 'neighbor')
    : null;
  const expectedAfterToken = command.precondition?.position.after
    ? await resolveTarget(command.precondition.position.after, 'neighbor')
    : null;

  const identityProjection = identityFields
    .map(
      (fieldName, index) =>
        `${quotePostgresIdentifier(targetMapping.columns[fieldName]!)} AS ${quotePostgresIdentifier(`identity_${index}`)}`,
    )
    .join(', ');
  const membersResult = await input.executeQuery<OrderedMemberRow>({
    text:
      `SELECT ctid::text AS row_token, ${relationColumn} AS source_value, ${identityProjection} ` +
      `FROM ${targetTable} WHERE ${relationColumn} = $1 ` +
      `ORDER BY ${quotePostgresIdentifier(relationMapping.orderColumn)} ASC, ctid ASC FOR UPDATE`,
    values: [sourceValue],
  });
  const members = membersResult.rows;
  const memberIndex = members.findIndex(row => row.row_token === memberToken);
  if (memberIndex < 0) {
    reject(
      'ordered_relationship_member_not_in_relation',
      'Ordered Relationship member does not belong to the source Relation.',
    );
  }
  const tokenPosition = (rows: readonly OrderedMemberRow[], index: number) => ({
    before: rows[index + 1]?.row_token ?? null,
    after: rows[index - 1]?.row_token ?? null,
  });
  const fromTokens = tokenPosition(members, memberIndex);
  if (
    command.precondition &&
    !positionsEqual(fromTokens, {
      before: expectedBeforeToken,
      after: expectedAfterToken,
    })
  ) {
    if (command.precondition.onMismatch === 'skip') {
      return notApplied(command);
    }
    throw new PostgresDataGraphError(
      'Ordered Relationship position did not match the command precondition.',
      'relationship_precondition_failed',
    );
  }

  if (placementAnchorToken === memberToken) return applied([]);
  const remaining = members.filter(row => row.row_token !== memberToken);
  let destinationIndex: number;
  if ('at' in command.position) {
    destinationIndex = command.position.at === 'start' ? 0 : remaining.length;
  } else {
    const anchorIndex = remaining.findIndex(row => row.row_token === placementAnchorToken);
    if (anchorIndex < 0) {
      reject(
        'ordered_relationship_anchor_not_in_relation',
        'Ordered Relationship anchor is not a member of the source Relation.',
      );
    }
    destinationIndex = 'before' in command.position ? anchorIndex : anchorIndex + 1;
  }
  const reordered = [...remaining];
  reordered.splice(destinationIndex, 0, members[memberIndex]!);
  if (reordered.every((row, index) => row.row_token === members[index]!.row_token)) {
    return applied([]);
  }

  const updateValues: unknown[] = [];
  const tuples = reordered.map((row, index) => {
    updateValues.push(row.row_token, index + 1);
    return `($${updateValues.length - 1}::tid, $${updateValues.length}::bigint)`;
  });
  await input.executeQuery({
    text:
      `UPDATE ${targetTable} AS member SET ${quotePostgresIdentifier(relationMapping.orderColumn)} = ordering.position ` +
      `FROM (VALUES ${tuples.join(', ')}) AS ordering(row_token, position) ` +
      'WHERE member.ctid = ordering.row_token',
    values: updateValues,
  });

  const identityRef = (row: OrderedMemberRow) => {
    const snapshot = Object.fromEntries(
      identityFields.map((fieldName, index) => [fieldName, row[`identity_${index}`]]),
    );
    const ref = createEntityIdentityRef(targetMapping.entity, snapshot);
    if (!ref) {
      throw new PostgresDataGraphError(
        'PostgreSQL ordered Relationship could not materialize a target identity.',
        'invalid_command',
      );
    }
    return ref;
  };
  const position = (
    rows: readonly OrderedMemberRow[],
    index: number,
  ): OrderedRelationshipPosition => ({
    before: rows[index + 1] ? identityRef(rows[index + 1]!) : null,
    after: rows[index - 1] ? identityRef(rows[index - 1]!) : null,
  });
  const nextIndex = reordered.findIndex(row => row.row_token === memberToken);
  return applied([
    {
      relation: command.relation,
      source: command.source,
      member: identityRef(members[memberIndex]!),
      from: position(members, memberIndex),
      to: position(reordered, nextIndex),
    },
  ]);
};

const applied = (
  moved: Extract<
    Extract<RelationshipCommandResult, { status: 'applied' }>['delta'],
    { moved: unknown }
  >['moved'],
): RelationshipCommandResult => ({ status: 'applied', delta: { added: [], removed: [], moved } });

const notApplied = (command: OrderedRelationshipCommand): RelationshipCommandResult => ({
  status: 'not-applied',
  diagnostic: {
    reason: 'relationship_precondition_failed',
    rejection: {
      version: 1,
      code: 'relationship_precondition_failed',
      message: 'Current Relation target did not match the command precondition.',
      parameters: {
        sourceEntityName: command.relation.sourceEntityName,
        relationName: command.relation.relationName,
        targetEntityName: command.relation.targetEntityName,
      },
    },
  },
});
