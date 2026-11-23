import type { AnyEntityDefinition } from '../entity/definition.js';
import type { AnyEntityRef, EntityRef } from '../entity/ref/model.js';
import type { SelectionExpression } from '../query/selection-ast.js';

import type { RelationDefinition } from './definition.js';

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

export type CanonicalOrderedRelationIdentity = {
  sourceEntityName: string;
  relationName: string;
  targetEntityName: string;
  cardinality: 'ordered-many';
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
  precondition?: { currentTarget: AnyEntityRef; onMismatch?: 'fail' | 'skip' };
};

type RelationTargetRef<TRelation extends RelationDefinition> = EntityRef<
  TRelation['target']['name']
>;

export type RelationshipAssignOptions<TRelation extends RelationDefinition> = {
  ifCurrent: RelationTargetRef<TRelation>;
  onMismatch?: 'fail' | 'skip';
};

export type ManyToManyRelationshipCommand = {
  kind: 'many-to-many-relationship-command';
  action: 'link' | 'unlink';
  relation: CanonicalManyToManyRelationIdentity;
  sources: RelationshipEndpointSelection;
  targets: RelationshipEndpointSelection;
};

export type OrderedRelationshipPosition = {
  before: AnyEntityRef | null;
  after: AnyEntityRef | null;
};
export type OrderedRelationshipPlacement =
  | { at: 'start' | 'end' }
  | { before: AnyEntityRef }
  | { after: AnyEntityRef };
export type OrderedRelationshipMoveOptions = {
  ifPosition?: OrderedRelationshipPosition;
  onMismatch?: 'fail' | 'skip';
};
export type OrderedRelationshipCommand = {
  kind: 'ordered-relationship-command';
  action: 'move';
  relation: CanonicalOrderedRelationIdentity;
  source: AnyEntityRef;
  member: AnyEntityRef;
  position: OrderedRelationshipPlacement;
  precondition?: { position: OrderedRelationshipPosition; onMismatch?: 'fail' | 'skip' };
};
export type OrderedRelationshipMove = {
  relation: CanonicalOrderedRelationIdentity;
  source: AnyEntityRef;
  member: AnyEntityRef;
  from: OrderedRelationshipPosition;
  to: OrderedRelationshipPosition;
};
export type RelationshipDelta = { added: RelationshipFact[]; removed: RelationshipFact[] };
export type OrderedRelationshipDelta = RelationshipDelta & { moved: OrderedRelationshipMove[] };

export type BoundRelationshipCommandOperations<
  TRelation extends RelationDefinition,
  TDirectCommand extends RelationshipCommand = RelationshipCommand,
  TManyToManyCommand extends ManyToManyRelationshipCommand = ManyToManyRelationshipCommand,
  TOrderedCommand extends OrderedRelationshipCommand = OrderedRelationshipCommand,
> =
  TRelation extends RelationDefinition<'belongsTo'>
    ? {
        assign: (
          target: RelationTargetRef<TRelation>,
          options?: RelationshipAssignOptions<TRelation>,
        ) => TDirectCommand;
        clear: () => TDirectCommand;
      }
    : TRelation extends RelationDefinition<'hasMany'>
      ? TRelation extends { ordered: true }
        ? {
            move: (
              member: RelationTargetRef<TRelation>,
              position: OrderedRelationshipPlacement,
              options?: OrderedRelationshipMoveOptions,
            ) => TOrderedCommand;
            append: (
              member: RelationTargetRef<TRelation>,
              options?: OrderedRelationshipMoveOptions,
            ) => TOrderedCommand;
            prepend: (
              member: RelationTargetRef<TRelation>,
              options?: OrderedRelationshipMoveOptions,
            ) => TOrderedCommand;
            before: (
              member: RelationTargetRef<TRelation>,
              anchor: RelationTargetRef<TRelation>,
              options?: OrderedRelationshipMoveOptions,
            ) => TOrderedCommand;
            after: (
              member: RelationTargetRef<TRelation>,
              anchor: RelationTargetRef<TRelation>,
              options?: OrderedRelationshipMoveOptions,
            ) => TOrderedCommand;
          }
        : {
            add: (source: RelationTargetRef<TRelation>) => TDirectCommand;
            remove: (source: RelationTargetRef<TRelation>) => TDirectCommand;
          }
      : TRelation extends RelationDefinition<'manyToMany'>
        ? {
            add: (target: RelationTargetRef<TRelation>) => TManyToManyCommand;
            remove: (target: RelationTargetRef<TRelation>) => TManyToManyCommand;
          }
        : never;

export type BoundEntityRefRelationshipCommands<
  TEntity extends AnyEntityDefinition,
  TDirectCommand extends RelationshipCommand = RelationshipCommand,
  TManyToManyCommand extends ManyToManyRelationshipCommand = ManyToManyRelationshipCommand,
  TOrderedCommand extends OrderedRelationshipCommand = OrderedRelationshipCommand,
> = {
  [TRelationName in keyof TEntity['relations']]: BoundRelationshipCommandOperations<
    TEntity['relations'][TRelationName],
    TDirectCommand,
    TManyToManyCommand,
    TOrderedCommand
  >;
};
