import { resolveRelationFields, type AnyEntityDefinition } from '../definitions.js';
import { RelationQueryBuilder, type SelectionValue } from '../query.js';

import { applyOrder, applyPredicates } from './query.js';

export type InMemoryDataset = Record<string, ReadonlyArray<Record<string, unknown>>>;

const materializeSelection = (
  row: Record<string, unknown>,
  selection: Record<string, SelectionValue>,
  context: {
    entity: AnyEntityDefinition;
    dataset: InMemoryDataset;
  },
) => {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(selection)) {
    if (!value) {
      continue;
    }

    if ((value as { kind?: string }).kind === 'field-ref') {
      result[key] = row[(value as { fieldName: string }).fieldName];
      continue;
    }

    if (value instanceof RelationQueryBuilder) {
      result[key] = materializeRelation(row, context.entity, value.toNodeSpec(), context.dataset);
      continue;
    }

    if (value && typeof value === 'object') {
      result[key] = materializeSelection(row, value as Record<string, SelectionValue>, context);
    }
  }

  return result;
};

const materializeDefaultEntity = (
  row: Record<string, unknown>,
  entityDefinition: AnyEntityDefinition,
) =>
  Object.fromEntries(
    Object.keys(entityDefinition.fields).map(fieldName => [fieldName, row[fieldName]]),
  );

export const materializeRelation = (
  sourceRow: Record<string, unknown>,
  sourceEntity: AnyEntityDefinition,
  relationNode: ReturnType<RelationQueryBuilder<any, any, any>['toNodeSpec']>,
  dataset: InMemoryDataset,
) => {
  const fields = resolveRelationFields(sourceEntity, relationNode.relationName, relationNode);
  const targetRows = dataset[relationNode.entity.name] ?? [];

  const relatedRows = applyOrder(
    applyPredicates(
      targetRows.filter(
        targetRow => targetRow[fields.targetField] === sourceRow[fields.sourceField],
      ),
      [],
    ),
    relationNode.orderBy,
  ).slice(0, relationNode.limit ?? Number.POSITIVE_INFINITY);

  const mappedRows = relatedRows.map(targetRow =>
    materializeRecord(
      targetRow,
      relationNode.entity,
      relationNode.select,
      relationNode.includes,
      dataset,
    ),
  );

  return relationNode.relationKind === 'belongsTo' ? (mappedRows[0] ?? null) : mappedRows;
};

export const materializeRecord = (
  row: Record<string, unknown>,
  entityDefinition: AnyEntityDefinition,
  selectShape: Record<string, SelectionValue> | undefined,
  includeShape: Record<string, RelationQueryBuilder<any, any, any>> | undefined,
  dataset: InMemoryDataset,
) => {
  const base = selectShape
    ? materializeSelection(row, selectShape, { entity: entityDefinition, dataset })
    : materializeDefaultEntity(row, entityDefinition);

  if (!includeShape) {
    return base;
  }

  for (const [relationName, relationBuilder] of Object.entries(includeShape)) {
    base[relationName] = materializeRelation(
      row,
      entityDefinition,
      relationBuilder.toNodeSpec(),
      dataset,
    );
  }

  return base;
};
