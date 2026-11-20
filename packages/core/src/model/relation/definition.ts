import { isJsonValue, type JsonValue } from '../../value/json.js';
import type { AnyEntityDefinition } from '../entity/definition.js';
import type { AnyEntityRef } from '../entity/ref/model.js';

export type RelationKind = 'hasMany' | 'belongsTo' | 'manyToMany';
export type RelationMappingKind = 'one-to-many' | 'many-to-one' | 'many-to-many';

export type DirectRelationMapping = {
  type: 'one-to-many' | 'many-to-one';
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  /** Provider-private position evidence for an ordered one-to-many Relation. */
  orderColumn?: string;
};

export type ManyToManyRelationMapping = {
  type: 'many-to-many';
  fromTable: string;
  fromColumn: string;
  throughTable: string;
  throughFromColumn: string;
  throughToColumn: string;
  toTable: string;
  toColumn: string;
};

export type ParsedRelationMapping = DirectRelationMapping | ManyToManyRelationMapping;

export type RelationConstraintRejection = {
  readonly version: 1;
  readonly code: string;
  readonly message: string;
  readonly parameters?: Readonly<Record<string, string | number | boolean | null>>;
};

export type PortableSelectionPredicate =
  | {
      readonly kind: 'predicate';
      readonly operator: 'eq' | 'lte' | 'lt' | 'gte' | 'gt';
      readonly fieldName: string;
      readonly value: JsonValue;
    }
  | {
      readonly kind: 'predicate';
      readonly operator: 'in';
      readonly fieldName: string;
      readonly values: readonly JsonValue[];
    }
  | {
      readonly kind: 'predicate';
      readonly operator: 'isNull';
      readonly fieldName: string;
    };

export type PortableSelectionExpression =
  | PortableSelectionPredicate
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }
  | { readonly kind: 'references'; readonly refs: readonly AnyEntityRef[] }
  | { readonly kind: 'and' | 'or'; readonly operands: readonly PortableSelectionExpression[] }
  | { readonly kind: 'not'; readonly operand: PortableSelectionExpression };

export type RelationParticipantSelectionConstraint = {
  readonly kind: 'participant-selection';
  /** Participant is relative to the Relation declaration, not storage orientation. */
  readonly participant: 'source' | 'target';
  readonly selection: PortableSelectionExpression;
  readonly rejection: RelationConstraintRejection;
};

export type RelationCountAtMostFieldConstraint = {
  readonly kind: 'relation-count-at-most-field';
  /** Field on the Entity that declares the to-many Relation. */
  readonly fieldName: string;
  readonly enforcement: 'authority-serialized';
  readonly rejection: RelationConstraintRejection;
};

export type RelationConstraint =
  | RelationParticipantSelectionConstraint
  | RelationCountAtMostFieldConstraint;

export const assertPortableRelationConstraints = (
  constraints: readonly RelationConstraint[] | undefined,
) => {
  if (constraints && !constraints.every(isJsonValue)) {
    throw new Error('Relation constraints must be JSON-safe.');
  }
};

export type RelationDeletePolicy = 'cascade' | 'detach';

export type RelationOptions = {
  via?: string;
  constraints?: readonly RelationConstraint[];
  ordered?: true;
  onDelete?: RelationDeletePolicy;
};

export type RelationDefinition<
  TKind extends RelationKind = RelationKind,
  TTarget extends AnyEntityDefinition = AnyEntityDefinition,
  TNullable extends boolean = boolean,
> = {
  kind: 'relation';
  relationKind: TKind;
  target: TTarget;
  sourceField?: string;
  targetField?: string;
  nullable?: TNullable;
  ordered?: true;
  onDelete?: RelationDeletePolicy;
  mapping?: ParsedRelationMapping;
  constraints?: readonly RelationConstraint[];
};
