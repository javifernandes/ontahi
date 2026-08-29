import {
  isDerivedFieldDefinition,
  resolveRelationFields,
  type AnyEntityDefinition,
  type DerivedFieldDefinition,
  type RelationDefinition,
} from '../definitions.js';
import { evaluateModelExpression } from '../model-expression/index.js';
import { RelationQueryBuilder, type SelectionValue } from '../query.js';
import { createEntityIdentityRef } from '../ref/index.js';
import {
  getEntityReferenceField,
  liftEntityReferenceRecord,
  liftEntityReferenceValue,
} from '../reference-field.js';
import type { RelationshipFact } from '../relationship-command.js';

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

const resolveRelatedRows = (
  sourceRow: Record<string, unknown>,
  sourceEntity: AnyEntityDefinition,
  relationName: string,
  relation: RelationDefinition,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[],
) => {
  const targetRows = dataset[relation.target.name] ?? [];

  if (relation.relationKind === 'manyToMany') {
    const sourceRef = createEntityIdentityRef(sourceEntity, sourceRow);
    if (!sourceRef) return [];
    const targetLocators = new Set(
      relationships
        .filter(
          fact =>
            'relationName' in fact.relation &&
            fact.relation.sourceEntityName === sourceEntity.name &&
            fact.relation.relationName === relationName &&
            JSON.stringify(fact.source.locator) === JSON.stringify(sourceRef.locator),
        )
        .map(fact => JSON.stringify(fact.target.locator)),
    );
    return targetRows.filter(targetRow => {
      const targetRef = createEntityIdentityRef(relation.target, targetRow);
      return targetRef ? targetLocators.has(JSON.stringify(targetRef.locator)) : false;
    });
  }

  const fields = resolveRelationFields(sourceEntity, relationName, { entity: relation.target });
  return targetRows.filter(
    targetRow => targetRow[fields.targetField] === sourceRow[fields.sourceField],
  );
};

const evaluateDerivedField = (
  row: Record<string, unknown>,
  entity: AnyEntityDefinition,
  fieldName: string,
  field: DerivedFieldDefinition<unknown>,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[],
) => {
  const program = field.derived.expression;
  if (!program) {
    throw new TypeError(
      `Derived Field ${entity.name}.${fieldName} has no compiled Model Expression. Run Ontahi codegen or use modelExpression.define(...).`,
    );
  }

  const fields: Record<string, unknown> = {};
  const relationAggregates: Record<string, { count: number }> = {};
  for (const dependency of field.derived.dependencies ?? []) {
    if (dependency.kind === 'field') {
      if (Object.prototype.hasOwnProperty.call(row, dependency.field)) {
        fields[dependency.field] = row[dependency.field];
      }
    } else if (dependency.kind === 'relation-aggregate') {
      const relation = entity.relations[dependency.relation];
      if (relation && Object.prototype.hasOwnProperty.call(dataset, relation.target.name)) {
        relationAggregates[dependency.relation] = {
          count: resolveRelatedRows(
            row,
            entity,
            dependency.relation,
            relation,
            dataset,
            relationships,
          ).length,
        };
      }
    }
  }

  return evaluateModelExpression(program, { fields, relationAggregates });
};

export const materializeDerivedFields = (
  row: Record<string, unknown>,
  entity: AnyEntityDefinition,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[],
) => {
  const materialized = { ...row };

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    if (!isDerivedFieldDefinition(field)) continue;
    const evaluation = evaluateDerivedField(row, entity, fieldName, field, dataset, relationships);
    if (evaluation.status === 'value') materialized[fieldName] = evaluation.value;
  }

  return materialized;
};

export const materializeRelation = (
  sourceRow: Record<string, unknown>,
  sourceEntity: AnyEntityDefinition,
  relationNode: ReturnType<RelationQueryBuilder<any, any, any>['toNodeSpec']>,
  dataset: InMemoryDataset,
  relationships: readonly RelationshipFact[] = [],
) => {
  const relation = sourceEntity.relations[relationNode.relationName];
  if (!relation) return relationNode.relationKind === 'belongsTo' ? null : [];
  const candidateRows = resolveRelatedRows(
    sourceRow,
    sourceEntity,
    relationNode.relationName,
    relation,
    dataset,
    relationships,
  );
  const materializedCandidates = candidateRows.map(row =>
    materializeDerivedFields(row, relationNode.entity, dataset, relationships),
  );

  const relatedRows = applyOrder(
    applyPredicates(materializedCandidates, []),
    relationNode.orderBy,
  ).slice(0, relationNode.limit ?? Number.POSITIVE_INFINITY);

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
  const materializedRow = materializeDerivedFields(row, entityDefinition, dataset, relationships);
  const base = selectShape
    ? materializeSelection(materializedRow, selectShape, {
        entity: entityDefinition,
        dataset,
        relationships,
      })
    : materializeDefaultEntity(materializedRow, entityDefinition);

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
