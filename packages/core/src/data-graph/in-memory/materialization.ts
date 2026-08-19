import { resolveRelationFields, type AnyEntityDefinition } from '../definitions.js';
import { createEntityIdentityRef } from '../ref.js';
import type { RelationshipFact } from '../relationship-command.js';
import { RelationQueryBuilder, type SelectionValue } from '../query.js';
import {
  getEntityReferenceField,
  liftEntityReferenceRecord,
  liftEntityReferenceValue,
} from '../reference-field.js';

import { applyOrder, applyPredicates } from './query.js';

export type InMemoryDataset = Record<string, ReadonlyArray<Record<string, unknown>>>;

const materializeSelection = (
  row: Record<string, unknown>,
  selection: Record<string, SelectionValue>,
  context: {
    entity: AnyEntityDefinition;
    dataset: InMemoryDataset;
    relationships: readonly RelationshipFact[];
  },
) => {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(selection)) {
    if (!value) {
      continue;
    }

    if ((value as { kind?: string }).kind === 'field-ref') {
      const fieldName = (value as { fieldName: string }).fieldName;
      const referenceField = getEntityReferenceField(context.entity, fieldName);
      result[key] = referenceField
        ? liftEntityReferenceValue(referenceField, row[fieldName])
        : row[fieldName];
      continue;
    }

    if (value instanceof RelationQueryBuilder) {
      result[key] = materializeRelation(
        row,
        context.entity,
        value.toNodeSpec(),
        context.dataset,
        context.relationships,
      );
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
  liftEntityReferenceRecord(
    entityDefinition,
    Object.fromEntries(
      Object.keys(entityDefinition.fields).map(fieldName => [fieldName, row[fieldName]]),
    ),
  );

export const materializeRelation = (
  sourceRow: Record<string, unknown>,
  sourceEntity: AnyEntityDefinition,
  relationNode: ReturnType<RelationQueryBuilder<any, any, any>['toNodeSpec']>,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[] = [],
) => {
  const targetRows = dataset[relationNode.entity.name] ?? [];
  const relation = sourceEntity.relations[relationNode.relationName];

  const candidateRows =
    relation?.relationKind === 'manyToMany'
      ? (() => {
          const sourceRef = createEntityIdentityRef(sourceEntity, sourceRow);
          if (!sourceRef) return [];
          const targetLocators = relationships
            .filter(
              fact =>
                'relationName' in fact.relation &&
                fact.relation.sourceEntityName === sourceEntity.name &&
                fact.relation.relationName === relationNode.relationName &&
                JSON.stringify(fact.source.locator) === JSON.stringify(sourceRef.locator),
            )
            .map(fact => JSON.stringify(fact.target.locator));
          return targetRows.filter(targetRow => {
            const targetRef = createEntityIdentityRef(relationNode.entity, targetRow);
            return targetRef ? targetLocators.includes(JSON.stringify(targetRef.locator)) : false;
          });
        })()
      : (() => {
          const fields = resolveRelationFields(
            sourceEntity,
            relationNode.relationName,
            relationNode,
          );
          return targetRows.filter(
            targetRow => targetRow[fields.targetField] === sourceRow[fields.sourceField],
          );
        })();

  const relatedRows = applyOrder(applyPredicates(candidateRows, []), relationNode.orderBy).slice(
    0,
    relationNode.limit ?? Number.POSITIVE_INFINITY,
  );

  const mappedRows = relatedRows.map(targetRow =>
    materializeRecord(
      targetRow,
      relationNode.entity,
      relationNode.select,
      relationNode.includes,
      dataset,
      relationships,
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
  relationships: readonly RelationshipFact[] = [],
) => {
  const base = selectShape
    ? materializeSelection(row, selectShape, { entity: entityDefinition, dataset, relationships })
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
      relationships,
    );
  }

  return base;
};
