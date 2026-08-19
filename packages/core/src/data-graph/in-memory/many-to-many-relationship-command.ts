import { Effect } from 'effect';

import type { AnyEntityDefinition } from '../definitions.js';
import { createEntityIdentityRef } from '../ref.js';
import type {
  ManyToManyRelationshipCommand,
  RelationshipEndpointSelection,
  RelationshipFact,
} from '../relationship-command.js';

import { InMemoryDataGraphError } from './command.js';
import type { InMemoryDataset } from './materialization.js';
import { applyEntitySelectionExpression } from './query.js';

export type InMemoryRelationshipFactStore = RelationshipFact[];

const findEntity = (entities: readonly AnyEntityDefinition[], entityName: string) => {
  const entity = entities.find(candidate => candidate.name === entityName);
  if (!entity) {
    throw new InMemoryDataGraphError(`Unknown Entity ${entityName}.`, 'invalid_command');
  }
  return entity;
};

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const sameRef = (left: RelationshipFact['source'], right: RelationshipFact['source']) =>
  left.entityName === right.entityName &&
  canonicalJson(left.locator) === canonicalJson(right.locator);

const sameRelation = (left: RelationshipFact['relation'], right: RelationshipFact['relation']) =>
  'relationName' in left &&
  'relationName' in right &&
  left.sourceEntityName === right.sourceEntityName &&
  left.relationName === right.relationName &&
  left.targetEntityName === right.targetEntityName;

const sameFact = (left: RelationshipFact, right: RelationshipFact) =>
  sameRelation(left.relation, right.relation) &&
  sameRef(left.source, right.source) &&
  sameRef(left.target, right.target);

const resolveEndpointRefs = (
  dataset: InMemoryDataset,
  entity: AnyEntityDefinition,
  endpoint: RelationshipEndpointSelection,
) => {
  if (endpoint.entityName !== entity.name) {
    throw new InMemoryDataGraphError(
      `Expected Relationship endpoint Selection for ${entity.name}, got ${endpoint.entityName}.`,
      'invalid_command',
    );
  }
  const rows = dataset[entity.name] ?? [];
  if (endpoint.selection.kind === 'references') {
    for (const ref of endpoint.selection.refs) {
      const matches = applyEntitySelectionExpression(entity, rows, {
        kind: 'references',
        refs: [ref],
      });
      if (matches.length !== 1) {
        throw new InMemoryDataGraphError(
          `Explicit ${entity.name} Relationship Ref must resolve exactly once.`,
          'cardinality_mismatch',
        );
      }
    }
  }
  const selectedRows = applyEntitySelectionExpression(entity, rows, endpoint.selection);
  const refs = selectedRows.map(row => createEntityIdentityRef(entity, row));
  if (refs.some(ref => !ref)) {
    throw new InMemoryDataGraphError(
      `Entity ${entity.name} needs an identity locator for Relationship Commands.`,
      'invalid_command',
    );
  }
  const unique = refs.filter(
    (ref, index, all) => all.findIndex(candidate => sameRef(candidate!, ref!)) === index,
  );
  return unique as RelationshipFact['source'][];
};

const execute = (
  dataset: InMemoryDataset,
  entities: readonly AnyEntityDefinition[],
  facts: InMemoryRelationshipFactStore,
  command: ManyToManyRelationshipCommand,
) => {
  const sourceEntity = findEntity(entities, command.relation.sourceEntityName);
  const targetEntity = findEntity(entities, command.relation.targetEntityName);
  const relation = sourceEntity.relations[command.relation.relationName];
  if (
    !relation ||
    relation.relationKind !== 'manyToMany' ||
    relation.target.name !== targetEntity.name
  ) {
    throw new InMemoryDataGraphError(
      `Unknown many-to-many Relation ${sourceEntity.name}.${command.relation.relationName}.`,
      'invalid_command',
    );
  }

  const sources = resolveEndpointRefs(dataset, sourceEntity, command.sources);
  const targets = resolveEndpointRefs(dataset, targetEntity, command.targets);
  const requested = sources.flatMap(source =>
    targets.map(
      target => ({ relation: command.relation, source, target }) satisfies RelationshipFact,
    ),
  );

  if (command.action === 'link') {
    const added = requested.filter(
      candidate => !facts.some(current => sameFact(current, candidate)),
    );
    facts.push(...added);
    return { added, removed: [] };
  }

  const removed = facts.filter(current =>
    requested.some(candidate => sameFact(current, candidate)),
  );
  const remaining = facts.filter(
    current => !removed.some(candidate => sameFact(current, candidate)),
  );
  facts.splice(0, facts.length, ...remaining);
  return { added: [], removed };
};

export const executeInMemoryManyToManyRelationshipCommandEffect = (
  dataset: InMemoryDataset,
  entities: readonly AnyEntityDefinition[],
  facts: InMemoryRelationshipFactStore,
  command: ManyToManyRelationshipCommand,
) =>
  Effect.try({
    try: () => execute(dataset, entities, facts, command),
    catch: cause =>
      cause instanceof InMemoryDataGraphError
        ? cause
        : new InMemoryDataGraphError(
            'Failed to execute in-memory many-to-many Relationship Command.',
            'mutation_failed',
            cause,
          ),
  });
