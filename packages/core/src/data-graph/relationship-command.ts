import type { AnyEntityDefinition, RelationDefinition, RelationKind } from './definitions.js';
import type { AnyEntityRef } from './ref.js';
import {
  copySelectionExpression,
  selectionReferences,
  type EntitySelectionSource,
  type SelectionExpression,
} from './selection-ast.js';

export type CanonicalRelationIdentity = {
  sourceEntityName: string;
  fieldName: string;
  targetEntityName: string;
};

export type CanonicalManyToManyRelationIdentity = {
  sourceEntityName: string;
  relationName: string;
  targetEntityName: string;
  cardinality: 'many-to-many';
};

export type RelationshipEndpointSelection = {
  entityName: string;
  selection: SelectionExpression;
};

export type RelationshipFact = {
  relation: CanonicalRelationIdentity | CanonicalManyToManyRelationIdentity;
  source: AnyEntityRef;
  target: AnyEntityRef;
};

export type RelationshipCommand = {
  kind: 'relationship-command';
  action: 'link' | 'unlink';
  relation: CanonicalRelationIdentity;
  source: AnyEntityRef;
  target?: AnyEntityRef;
};

export type ManyToManyRelationshipCommand = {
  kind: 'many-to-many-relationship-command';
  action: 'link' | 'unlink';
  relation: CanonicalManyToManyRelationIdentity;
  sources: RelationshipEndpointSelection;
  targets: RelationshipEndpointSelection;
};

export type RelationshipDelta = {
  added: RelationshipFact[];
  removed: RelationshipFact[];
};

export interface RelationshipCommandExecutionRuntime<TError = never, TOptions = undefined> {
  runRelationshipCommand(
    command: RelationshipCommand,
    options?: TOptions,
  ): import('effect').Effect.Effect<RelationshipDelta, TError>;
}

export interface ManyToManyRelationshipCommandExecutionRuntime<
  TError = never,
  TOptions = undefined,
> {
  runManyToManyRelationshipCommand(
    command: ManyToManyRelationshipCommand,
    options?: TOptions,
  ): import('effect').Effect.Effect<RelationshipDelta, TError>;
}

type RelationshipSelectionInput = AnyEntityRef | EntitySelectionSource<AnyEntityDefinition>;

const endpointSelection = (
  entity: AnyEntityDefinition,
  input: RelationshipSelectionInput,
): RelationshipEndpointSelection => {
  if ('entityName' in input) {
    assertRefEntity(input, entity, 'relationship endpoint');
    return { entityName: entity.name, selection: selectionReferences([input]) };
  }
  if (input.root.name !== entity.name) {
    throw new Error(
      `Expected relationship endpoint Selection for ${entity.name}, got ${input.root.name}.`,
    );
  }
  return { entityName: entity.name, selection: copySelectionExpression(input.expression) };
};

export const relationshipSet = (
  entity: AnyEntityDefinition,
  relationName: string,
  sources: RelationshipSelectionInput,
) => {
  const definition = entity.relations[relationName];
  if (definition?.relationKind !== 'manyToMany') {
    throw new Error(`Relation ${entity.name}.${relationName} is not many-to-many.`);
  }
  const sourceSelection = endpointSelection(entity, sources);
  const relation: CanonicalManyToManyRelationIdentity = {
    sourceEntityName: entity.name,
    relationName,
    targetEntityName: definition.target.name,
    cardinality: 'many-to-many',
  };
  const command = (
    action: ManyToManyRelationshipCommand['action'],
    targets: RelationshipSelectionInput,
  ): ManyToManyRelationshipCommand => ({
    kind: 'many-to-many-relationship-command',
    action,
    relation,
    sources: sourceSelection,
    targets: endpointSelection(definition.target, targets),
  });

  return {
    add: (targets: RelationshipSelectionInput) => command('link', targets),
    remove: (targets: RelationshipSelectionInput) => command('unlink', targets),
  };
};

type ResolvedRelation = {
  definition: RelationDefinition<RelationKind, AnyEntityDefinition>;
  identity: CanonicalRelationIdentity;
  sourceEntity: AnyEntityDefinition;
  targetEntity: AnyEntityDefinition;
  direction: 'forward' | 'inverse';
};

const resolveRelation = (entity: AnyEntityDefinition, relationName: string): ResolvedRelation => {
  const definition = entity.relations[relationName];
  if (!definition) {
    throw new Error(`Unknown Relation ${entity.name}.${relationName}.`);
  }

  if (definition.relationKind === 'belongsTo' && definition.sourceField) {
    return {
      definition,
      identity: {
        sourceEntityName: entity.name,
        fieldName: definition.sourceField,
        targetEntityName: definition.target.name,
      },
      sourceEntity: entity,
      targetEntity: definition.target,
      direction: 'forward',
    };
  }

  if (definition.relationKind === 'hasMany' && definition.targetField) {
    return {
      definition,
      identity: {
        sourceEntityName: definition.target.name,
        fieldName: definition.targetField,
        targetEntityName: entity.name,
      },
      sourceEntity: definition.target,
      targetEntity: entity,
      direction: 'inverse',
    };
  }

  throw new Error(
    `Relation ${entity.name}.${relationName} needs Reference Field evidence for structural commands.`,
  );
};

const assertRefEntity = (ref: AnyEntityRef, entity: AnyEntityDefinition, role: string) => {
  if (ref.entityName !== entity.name) {
    throw new Error(`Expected ${role} Ref for ${entity.name}, got ${ref.entityName}.`);
  }
};

export const relationship = (
  entity: AnyEntityDefinition,
  relationName: string,
  subject: AnyEntityRef,
) => {
  const resolved = resolveRelation(entity, relationName);
  assertRefEntity(subject, entity, 'relationship subject');

  const command = (action: 'link' | 'unlink', participant?: AnyEntityRef): RelationshipCommand => {
    if (resolved.direction === 'forward') {
      if (participant) assertRefEntity(participant, resolved.targetEntity, 'target');
      return {
        kind: 'relationship-command',
        action,
        relation: resolved.identity,
        source: subject,
        ...(participant ? { target: participant } : {}),
      };
    }

    if (!participant) {
      throw new Error(`Inverse Relation ${entity.name}.${relationName} requires a source Ref.`);
    }
    assertRefEntity(participant, resolved.sourceEntity, 'source');
    return {
      kind: 'relationship-command',
      action,
      relation: resolved.identity,
      source: participant,
      target: subject,
    };
  };

  const assertDirection = (expected: ResolvedRelation['direction'], action: string) => {
    if (resolved.direction !== expected) {
      throw new Error(
        `${action} is not valid for ${resolved.direction} Relation ${entity.name}.${relationName}.`,
      );
    }
  };

  return {
    assign: (target: AnyEntityRef) => {
      assertDirection('forward', 'assign');
      return command('link', target);
    },
    clear: () => {
      assertDirection('forward', 'clear');
      return command('unlink');
    },
    add: (source: AnyEntityRef) => {
      assertDirection('inverse', 'add');
      return command('link', source);
    },
    remove: (source: AnyEntityRef) => {
      assertDirection('inverse', 'remove');
      return command('unlink', source);
    },
  };
};
