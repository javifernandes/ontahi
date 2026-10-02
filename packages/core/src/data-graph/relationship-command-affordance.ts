import { isRecord } from '../value/object.js';

import { graphSchema, type AnyEntityDefinition, type GraphSchemaFields } from './definitions.js';
import { getEntityIdentityLocator } from './ref/index.js';
import type {
  CanonicalManyToManyRelationIdentity,
  CanonicalOrderedRelationIdentity,
  CanonicalRelationIdentity,
} from './relationship-command.js';
import { toGraphSchemaDescriptor, type GraphSchemaObjectDescriptor } from './schema-descriptor.js';

type EndpointDescriptor = {
  readonly entityName: string;
  readonly locator: GraphSchemaObjectDescriptor;
};

export type RelationshipCommandAffordanceDescriptor =
  | {
      readonly kind: 'relationship-command-affordance';
      readonly relationKind: 'direct';
      readonly relation: CanonicalRelationIdentity;
      readonly actions: readonly ('link' | 'unlink')[];
      readonly source: EndpointDescriptor;
      readonly target: EndpointDescriptor;
      readonly precondition: true;
    }
  | {
      readonly kind: 'relationship-command-affordance';
      readonly relationKind: 'many-to-many';
      readonly relation: CanonicalManyToManyRelationIdentity;
      readonly actions: readonly ('link' | 'unlink')[];
      readonly source: EndpointDescriptor;
      readonly target: EndpointDescriptor;
    }
  | {
      readonly kind: 'relationship-command-affordance';
      readonly relationKind: 'ordered';
      readonly relation: CanonicalOrderedRelationIdentity;
      readonly actions: readonly ['move'];
      readonly source: EndpointDescriptor;
      readonly member: EndpointDescriptor;
      readonly placements: readonly ['before', 'after', 'start', 'end'];
      readonly precondition: true;
    };

const endpointDescriptor = (entity: AnyEntityDefinition): EndpointDescriptor | undefined => {
  const identity = getEntityIdentityLocator(entity);
  const fields = identity?.locator.fields;
  if (!fields?.length) return undefined;
  const locator = graphSchema.object(
    Object.fromEntries(fields.map(name => [name, entity.fields[name]!])) as GraphSchemaFields,
    { unknownKeys: 'strict' },
  );
  return {
    entityName: entity.name,
    locator: toGraphSchemaDescriptor(locator) as GraphSchemaObjectDescriptor,
  };
};

export const directRelationshipCommandAffordance = (
  relation: CanonicalRelationIdentity,
  source: AnyEntityDefinition,
  target: AnyEntityDefinition,
  actions: readonly ('link' | 'unlink')[],
): RelationshipCommandAffordanceDescriptor | undefined => {
  const sourceDescriptor = endpointDescriptor(source);
  const targetDescriptor = endpointDescriptor(target);
  if (!sourceDescriptor || !targetDescriptor) return undefined;
  return {
    kind: 'relationship-command-affordance',
    relationKind: 'direct',
    relation,
    actions,
    source: sourceDescriptor,
    target: targetDescriptor,
    precondition: true,
  };
};

export const manyToManyRelationshipCommandAffordance = (
  relation: CanonicalManyToManyRelationIdentity,
  source: AnyEntityDefinition,
  target: AnyEntityDefinition,
  actions: readonly ('link' | 'unlink')[],
): RelationshipCommandAffordanceDescriptor | undefined => {
  const sourceDescriptor = endpointDescriptor(source);
  const targetDescriptor = endpointDescriptor(target);
  if (!sourceDescriptor || !targetDescriptor) return undefined;
  return {
    kind: 'relationship-command-affordance',
    relationKind: 'many-to-many',
    relation,
    actions,
    source: sourceDescriptor,
    target: targetDescriptor,
  };
};

export const orderedRelationshipCommandAffordance = (
  relation: CanonicalOrderedRelationIdentity,
  source: AnyEntityDefinition,
  member: AnyEntityDefinition,
): RelationshipCommandAffordanceDescriptor | undefined => {
  const sourceDescriptor = endpointDescriptor(source);
  const memberDescriptor = endpointDescriptor(member);
  if (!sourceDescriptor || !memberDescriptor) return undefined;
  return {
    kind: 'relationship-command-affordance',
    relationKind: 'ordered',
    relation,
    actions: ['move'],
    source: sourceDescriptor,
    member: memberDescriptor,
    placements: ['before', 'after', 'start', 'end'],
    precondition: true,
  };
};

const isEndpointDescriptor = (value: unknown): value is EndpointDescriptor =>
  isRecord(value) &&
  typeof value.entityName === 'string' &&
  isRecord(value.locator) &&
  value.locator.kind === 'object' &&
  value.locator.unknownKeys === 'strict' &&
  isRecord(value.locator.fields) &&
  Object.keys(value.locator.fields).length > 0 &&
  Object.values(value.locator.fields).every(
    field =>
      isRecord(field) &&
      ((field.kind === 'scalar' &&
        ['id', 'string', 'number', 'boolean', 'date', 'json', 'enum'].includes(
          String(field.type),
        )) ||
        (field.kind === 'entity-ref' && typeof field.entityName === 'string')),
  );

const hasRelationEndpoints = (
  relation: Record<string, unknown>,
  source: EndpointDescriptor,
  target: EndpointDescriptor,
) =>
  relation.sourceEntityName === source.entityName &&
  relation.targetEntityName === target.entityName;

export const isRelationshipCommandAffordanceDescriptor = (
  value: unknown,
): value is RelationshipCommandAffordanceDescriptor => {
  if (
    !isRecord(value) ||
    value.kind !== 'relationship-command-affordance' ||
    !isRecord(value.relation) ||
    !Array.isArray(value.actions) ||
    !isEndpointDescriptor(value.source)
  )
    return false;
  if (value.relationKind === 'direct') {
    if (!isEndpointDescriptor(value.target)) return false;
    return (
      typeof value.relation.fieldName === 'string' &&
      hasRelationEndpoints(value.relation, value.source, value.target) &&
      value.actions.every(action => action === 'link' || action === 'unlink') &&
      value.actions.length > 0 &&
      value.precondition === true
    );
  }
  if (value.relationKind === 'many-to-many') {
    if (!isEndpointDescriptor(value.target)) return false;
    return (
      value.relation.cardinality === 'many-to-many' &&
      typeof value.relation.relationName === 'string' &&
      hasRelationEndpoints(value.relation, value.source, value.target) &&
      value.actions.every(action => action === 'link' || action === 'unlink') &&
      value.actions.length > 0
    );
  }
  if (!isEndpointDescriptor(value.member)) return false;
  return (
    value.relationKind === 'ordered' &&
    value.relation.cardinality === 'ordered-many' &&
    typeof value.relation.relationName === 'string' &&
    hasRelationEndpoints(value.relation, value.source, value.member) &&
    value.actions.length === 1 &&
    value.actions[0] === 'move' &&
    isEndpointDescriptor(value.member) &&
    Array.isArray(value.placements) &&
    value.placements.length === 4 &&
    value.placements.every(placement =>
      ['before', 'after', 'start', 'end'].includes(String(placement)),
    ) &&
    value.precondition === true
  );
};
