import {
  appliedRelationshipCommand,
  notAppliedRelationshipCommand,
  entityRefsEqual,
  isReferenceFieldDefinition,
  liftEntityReferenceValue,
  type AnyEntityRef,
  type OrderedRelationshipCommand,
  type OrderedRelationshipPosition,
  type RelationshipCommandResult,
} from '@ontahi/core/data-graph';
import type { RowDataPacket } from 'mysql2/promise';

import { executeMysql } from './client.js';
import { invalidMysqlCommand as invalid, requireMysqlOne } from './mutation-contract.js';
import type { MysqlRelationshipContext } from './relationship-context.js';
import { MysqlDataGraphError } from './runtime-error.js';
import { quoteMysqlIdentifier as quote } from './sql.js';

const reject = (code: string, message: string): never => {
  throw new MysqlDataGraphError(message, 'ordered_relationship_rejected', undefined, {
    version: 1,
    code,
    message,
  });
};
const equalPosition = (left: OrderedRelationshipPosition, right: OrderedRelationshipPosition) =>
  (left.before === null
    ? right.before === null
    : right.before !== null && entityRefsEqual(left.before, right.before)) &&
  (left.after === null
    ? right.after === null
    : right.after !== null && entityRefsEqual(left.after, right.after));

const placementAnchor = (placement: OrderedRelationshipCommand['position']) => {
  if ('before' in placement) return placement.before;
  if ('after' in placement) return placement.after;
  return undefined;
};
const resolveExpectedPosition = async (
  command: OrderedRelationshipCommand,
  resolve: (ref: AnyEntityRef, role: 'neighbor') => Promise<AnyEntityRef>,
) => {
  if (!command.precondition) return undefined;
  const { before, after } = command.precondition.position;
  return {
    before: before ? await resolve(before, 'neighbor') : null,
    after: after ? await resolve(after, 'neighbor') : null,
  };
};
const placementIndex = (
  placement: OrderedRelationshipCommand['position'],
  refs: AnyEntityRef[],
  anchor?: AnyEntityRef,
) => {
  if ('at' in placement) return placement.at === 'start' ? 0 : refs.length;
  const index = refs.findIndex(ref => entityRefsEqual(ref, anchor!));
  if (index < 0)
    reject(
      'ordered_relationship_anchor_not_in_relation',
      'Ordered Relationship anchor is outside its source Relation.',
    );
  return 'before' in placement ? index : index + 1;
};

const resolveOrderedRelation = (
  context: MysqlRelationshipContext,
  command: OrderedRelationshipCommand,
) => {
  const source = context.mappingFor(command.relation.sourceEntityName);
  const target = context.mappingFor(command.relation.targetEntityName);
  const relation = source.entity.relations[command.relation.relationName];
  const mapping = relation?.mapping;
  const targetFieldName = relation?.targetField;
  const targetField = targetFieldName ? target.entity.fields[targetFieldName] : undefined;
  if (
    relation?.relationKind !== 'hasMany' ||
    !relation.ordered ||
    relation.target !== target.entity ||
    !targetFieldName ||
    !targetField ||
    !isReferenceFieldDefinition(targetField) ||
    targetField.target !== source.entity ||
    targetField.nullable ||
    targetField.optional ||
    mapping?.type !== 'one-to-many' ||
    !mapping.orderColumn ||
    mapping.fromTable !== source.table ||
    mapping.toTable !== target.table ||
    mapping.toColumn !== target.columns[targetFieldName]
  ) {
    return invalid(
      'MySQL ordered Relationship Command requires a mapped ordered required inverse Relation.',
    );
  }
  const sourceField = Object.keys(source.columns).find(
    field => source.columns[field] === mapping.fromColumn,
  );
  if (!sourceField) return invalid('MySQL ordered Relation source key is not mapped.');
  return {
    source,
    target,
    targetFieldName,
    targetField,
    mapping,
    sourceField,
    orderColumn: mapping.orderColumn,
  };
};

export const executeMysqlOrderedRelationshipCommand = async (
  context: MysqlRelationshipContext,
  command: OrderedRelationshipCommand,
): Promise<RelationshipCommandResult> => {
  const { source, target, targetFieldName, targetField, mapping, sourceField, orderColumn } =
    resolveOrderedRelation(context, command);
  const sources = await context.refRows(source, command.source);
  if (!sources.length)
    reject('ordered_relationship_source_not_found', 'Ordered Relationship source was not found.');
  requireMysqlOne(sources.length);
  const sourceValue = sources[0]![sourceField];
  const resolveParticipant = async (ref: AnyEntityRef, role: 'member' | 'anchor' | 'neighbor') => {
    const rows = await context.refRows(target, ref);
    if (!rows.length)
      reject(
        `ordered_relationship_${role}_not_found`,
        `Ordered Relationship ${role} was not found.`,
      );
    requireMysqlOne(rows.length);
    if (rows[0]![targetFieldName] !== sourceValue)
      reject(
        `ordered_relationship_${role}_not_in_relation`,
        `Ordered Relationship ${role} is not a member of the source Relation.`,
      );
    return context.identity(target, rows[0]!);
  };
  const member = await resolveParticipant(command.member, 'member');
  const anchor = placementAnchor(command.position);
  const anchorRef = anchor ? await resolveParticipant(anchor, 'anchor') : undefined;
  const expected = await resolveExpectedPosition(command, resolveParticipant);
  // The source lock serializes moves in this collection, including readers that wait for a prior
  // mover. Membership is fetched in a new statement after that lock has been acquired.
  const rows = await context.rows(
    target,
    {
      kind: 'predicate',
      operator: 'eq',
      fieldName: targetFieldName,
      value: liftEntityReferenceValue(targetField, sourceValue),
    },
    orderColumn,
  );
  const members = rows.map(row => ({ row, ref: context.identity(target, row) }));
  const memberIndex = members.findIndex(entry => entityRefsEqual(entry.ref, member));
  if (memberIndex < 0)
    reject(
      'ordered_relationship_member_not_in_relation',
      'Ordered Relationship member is outside its source Relation.',
    );
  const position = (entries: typeof members, index: number): OrderedRelationshipPosition => ({
    before: entries[index + 1]?.ref ?? null,
    after: entries[index - 1]?.ref ?? null,
  });
  const from = position(members, memberIndex);
  if (expected && !equalPosition(from, expected)) {
    if (command.precondition?.onMismatch === 'skip') return notAppliedRelationshipCommand(command);
    throw new MysqlDataGraphError(
      'Ordered Relationship position did not match the precondition.',
      'relationship_precondition_failed',
    );
  }
  const unchanged = () => appliedRelationshipCommand({ added: [], removed: [], moved: [] });
  if (anchorRef && entityRefsEqual(anchorRef, member)) return unchanged();
  const reordered = members.filter(entry => !entityRefsEqual(entry.ref, member));
  const index = placementIndex(
    command.position,
    reordered.map(entry => entry.ref),
    anchorRef,
  );
  reordered.splice(index, 0, members[memberIndex]!);
  if (reordered.every((entry, i) => entityRefsEqual(entry.ref, members[i]!.ref)))
    return unchanged();
  const [maximum] = await executeMysql<RowDataPacket[]>(
    context.client,
    `SELECT CAST(COALESCE(MAX(${quote(orderColumn)}), 0) AS CHAR) AS max_position FROM ${quote(target.table)} WHERE ${quote(mapping.toColumn)} = ?`,
    [sourceValue],
  );
  const max = BigInt(maximum[0]!.max_position);
  // Move into a disjoint positive range first. MySQL checks unique indexes row by row, so a
  // direct permutation of existing positions can fail even though the final order is unique.
  const temporaryBase = max > BigInt(reordered.length) ? max : BigInt(reordered.length);
  for (const [i, entry] of reordered.entries())
    await context.update(target, entry.row, orderColumn, String(temporaryBase + BigInt(i + 1)));
  for (const [i, entry] of reordered.entries())
    await context.update(target, entry.row, orderColumn, i + 1);
  return appliedRelationshipCommand({
    added: [],
    removed: [],
    moved: [
      {
        relation: command.relation,
        source: command.source,
        member,
        from,
        to: position(reordered, index),
      },
    ],
  });
};
