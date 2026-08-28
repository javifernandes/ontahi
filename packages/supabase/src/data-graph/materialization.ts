import {
  getEntityMapping,
  isDerivedFieldDefinition,
  resolveColumnNameForEntity,
  type AnyEntityDefinition,
  RelationQueryBuilder,
  type SelectionValue,
} from '@ontahi/core/data-graph';

import type { EntityRow, IncludeShape, SelectionShape } from './types.js';

import { mapSupabaseRowToEntityFields } from './index.js';

export const selectColumnsForQuery = ({
  entityDefinition,
  selectShape,
  includeShape,
}: {
  entityDefinition: AnyEntityDefinition;
  selectShape?: SelectionShape;
  includeShape?: IncludeShape;
}) => {
  const fieldNames =
    selectShape == null
      ? Object.keys(entityDefinition.fields)
      : (() => {
          const names = new Set<string>();
          const visit = (value: unknown) => {
            if (!value || typeof value !== 'object') {
              return;
            }

            if ((value as { kind?: string }).kind === 'field-ref') {
              names.add((value as { fieldName: string }).fieldName);
              return;
            }

            if (value instanceof RelationQueryBuilder) {
              return;
            }

            for (const nestedValue of Object.values(value as Record<string, unknown>)) {
              visit(nestedValue);
            }
          };

          for (const value of Object.values(selectShape)) {
            visit(value);
          }

          return [...names];
        })();

  const unsupportedDerivedField = fieldNames.find(fieldName =>
    isDerivedFieldDefinition(entityDefinition.fields[fieldName]!),
  );
  if (unsupportedDerivedField) {
    throw new Error(
      `Supabase graph reads do not support derived Field ${entityDefinition.name}.${unsupportedDerivedField}.`,
    );
  }

  const columns = new Set(
    fieldNames.map(fieldName => resolveColumnNameForEntity(entityDefinition, fieldName)),
  );

  for (const [relationName, relationBuilder] of Object.entries(includeShape ?? {})) {
    const relationNode = relationBuilder.toNodeSpec();
    const relationDefinition = entityDefinition.relations[relationName];
    const mapping = relationDefinition?.mapping;

    if (!mapping) {
      throw new Error(
        `Relation ${relationName} on ${entityDefinition.name} has no mapping configured`,
      );
    }

    const sourceField =
      Object.entries(getEntityMapping(entityDefinition).columns).find(
        ([, columnName]) => columnName === mapping.fromColumn,
      )?.[0] ?? mapping.fromColumn;

    columns.add(resolveColumnNameForEntity(entityDefinition, sourceField));
  }

  return [...columns];
};

export const toSupabaseEntityRow = (
  entityDefinition: AnyEntityDefinition,
  row: Record<string, unknown>,
): EntityRow => mapSupabaseRowToEntityFields(entityDefinition, row);

const materializeSelection = (row: EntityRow, selection: SelectionShape) => {
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
      result[key] = row[value.relationName];
      continue;
    }

    if (value && typeof value === 'object') {
      result[key] = materializeSelection(row, value as Record<string, SelectionValue>);
    }
  }

  return result;
};

export const materializeSupabaseEntityRow = (
  row: EntityRow,
  entityDefinition: AnyEntityDefinition,
  selectShape?: SelectionShape,
  includeShape?: IncludeShape,
) => {
  const base = selectShape
    ? materializeSelection(row, selectShape)
    : Object.fromEntries(
        Object.keys(entityDefinition.fields).map(fieldName => [fieldName, row[fieldName]]),
      );

  for (const relationName of Object.keys(includeShape ?? {})) {
    base[relationName] = row[relationName];
  }

  return base;
};
