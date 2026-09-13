import {
  compileSelectionExpression,
  getEntityIdentityLocator,
  getEntityMapping,
  hasRelationImage,
  lowerSelectionReferences,
  resolveRelationFields,
  type AnyEntityDefinition,
  type CompiledSelectionExpression,
  type SelectionExpression,
} from '@ontahi/core/data-graph';

import { serializeSupabaseSelection } from './selection-filter.js';

export type ContextualSelectionPlan = {
  embeds: string[];
  filter: string | boolean;
  filters: Array<{ path: string; filter: string }>;
};

// Relationship syntax is provider-owned. Fail closed for names that would change PostgREST grammar.
const identifier = (name: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new TypeError(`Unsupported PostgREST contextual identifier: ${name}.`);
  return name;
};

const storedColumn = (entity: AnyEntityDefinition, field: string) => {
  const columns = getEntityMapping(entity).columns;
  if (!Object.prototype.hasOwnProperty.call(columns, field))
    throw new TypeError(`Contextual reads require a stored field: ${entity.name}.${field}.`);
  return identifier(columns[field]!);
};

const relationshipSelector = (
  source: AnyEntityDefinition,
  target: AnyEntityDefinition,
  name: string,
) => {
  const relation = Object.prototype.hasOwnProperty.call(source.relations, name)
    ? source.relations[name]
    : undefined;
  if (!relation || relation.target !== target)
    throw new TypeError(
      `Selection relation ${source.name}.${name} does not target registered ${target.name}.`,
    );
  const sourceTable = identifier(getEntityMapping(source).tableName);
  identifier(getEntityMapping(target).tableName);
  if (relation.relationKind === 'manyToMany') {
    const mapping = relation.mapping;
    const sourceKey = getEntityIdentityLocator(source)?.locator.fields;
    const targetKey = getEntityIdentityLocator(target)?.locator.fields;
    if (sourceKey?.length !== 1 || targetKey?.length !== 1)
      throw new TypeError(
        'PostgREST contextual many-to-many reads require single-field identities.',
      );
    if (
      !mapping ||
      mapping.type !== 'many-to-many' ||
      mapping.fromTable !== sourceTable ||
      mapping.toTable !== getEntityMapping(target).tableName ||
      mapping.fromColumn !== storedColumn(source, sourceKey[0]!) ||
      mapping.toColumn !== storedColumn(target, targetKey[0]!)
    )
      throw new TypeError(
        `Contextual relation ${source.name}.${name} requires matching edge mappings.`,
      );
    identifier(mapping.throughFromColumn);
    identifier(mapping.throughToColumn);
    return `${sourceTable}!${identifier(mapping.throughTable)}`;
  }
  const fields = resolveRelationFields(source, name, { entity: target });
  const sourceColumn = storedColumn(source, fields.sourceField);
  const targetColumn = storedColumn(target, fields.targetField);
  if (sourceTable === getEntityMapping(target).tableName) {
    if (relation.relationKind !== 'hasMany')
      throw new TypeError(
        'PostgREST contextual self navigation currently requires a hasMany relation.',
      );
    return targetColumn;
  }
  return `${sourceTable}!${relation.relationKind === 'hasMany' ? targetColumn : sourceColumn}`;
};

/** Lower membership to independent empty embeds. Never fetch a source population. */
export const compileContextualSelection = (
  root: AnyEntityDefinition,
  expression: SelectionExpression,
  entities: readonly AnyEntityDefinition[] = [],
): ContextualSelectionPlan | undefined => {
  if (!hasRelationImage(expression)) return undefined;
  const registered = (name: string) => {
    const matches = entities.filter(entity => entity.name === name);
    if (matches.length !== 1)
      throw new TypeError(
        `Expected one registered contextual Entity ${name}; received ${matches.length}.`,
      );
    return matches[0]!;
  };
  if (registered(root.name) !== root)
    throw new TypeError('Contextual read root does not match its registered Entity.');
  const reserved = new Set(
    entities.flatMap(entity => Object.values(getEntityMapping(entity).columns)),
  );
  let aliasIndex = 0;
  let nodes = 0;
  const alias = () => {
    let name: string;
    do {
      name = `__ontahi_image_${aliasIndex++}`;
    } while (reserved.has(name));
    return name;
  };
  const level = (
    entity: AnyEntityDefinition,
    expression: SelectionExpression,
    depth: number,
  ): ContextualSelectionPlan => {
    const embeds: string[] = [];
    const filters: ContextualSelectionPlan['filters'] = [];
    const visit = (value: SelectionExpression, depth: number): CompiledSelectionExpression => {
      if (++nodes > 1000 || depth > 32)
        throw new TypeError('Contextual Selection exceeds depth or node budget.');
      if (value.kind === 'references') return visit(lowerSelectionReferences(value), depth + 1);
      if (value.kind === 'and' || value.kind === 'or')
        return {
          kind: value.kind,
          operands: value.operands.map(operand => visit(operand, depth + 1)),
        };
      if (value.kind === 'not') return { kind: 'not', operand: visit(value.operand, depth + 1) };
      if (value.kind === 'relation-image') {
        const source = registered(value.source.entityName);
        const selector = relationshipSelector(source, entity, value.relationName);
        const sourcePlan = level(source, value.source.expression, depth + 1);
        if (sourcePlan.filter === false) return { kind: 'none' };
        const name = alias();
        embeds.push(`${name}:${selector}(${sourcePlan.embeds.join(',')})`);
        for (const filter of sourcePlan.filters)
          filters.push({ ...filter, path: `${name}.${filter.path}` });
        if (typeof sourcePlan.filter === 'string')
          filters.push({ path: name, filter: sourcePlan.filter });
        return { kind: 'not', operand: { operator: 'isNull', field: name, column: name } };
      }
      if (value.kind === 'predicate') storedColumn(entity, value.fieldName);
      return compileSelectionExpression(entity, value);
    };
    return { embeds, filters, filter: serializeSupabaseSelection(visit(expression, depth)) };
  };
  return level(root, expression, 0);
};

export const applyContextualSelection = <
  TQuery extends {
    or: (filter: string, options?: { referencedTable: string }) => TQuery;
  },
>(
  query: TQuery,
  plan: ContextualSelectionPlan,
): TQuery => {
  let result = query;
  for (const { path, filter } of plan.filters)
    result = result.or(filter, { referencedTable: path });
  return typeof plan.filter === 'string' ? result.or(plan.filter) : result;
};
