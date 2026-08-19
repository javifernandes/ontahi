import type { AnyEntityDefinition, RelationDefinition, RelationKind } from './definitions.js';
import type { AnyEntityRef } from './ref.js';

export type CanonicalRelationIdentity = {
  sourceEntityName: string;
  fieldName: string;
  targetEntityName: string;
};

export type RelationshipFact = {
  relation: CanonicalRelationIdentity;
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

export type RelationshipDelta = {
  added: RelationshipFact[];
  removed: RelationshipFact[];
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
