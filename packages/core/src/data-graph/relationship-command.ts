import type { Effect } from 'effect';

import {
  resolveHasManyTargetField,
  type AnyEntityDefinition,
  type RelationDefinition,
  type RelationKind,
} from './definitions.js';
import type { AnyEntityRef, EntityRef } from './ref/index.js';
import type { RelationshipCommandResult } from './relationship-command-result.js';
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
  precondition?: {
    currentTarget: AnyEntityRef;
    onMismatch?: 'fail' | 'skip';
  };
};

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
  precondition?: {
    position: OrderedRelationshipPosition;
    onMismatch?: 'fail' | 'skip';
  };
};

export type OrderedRelationshipMove = {
  relation: CanonicalOrderedRelationIdentity;
  source: AnyEntityRef;
  member: AnyEntityRef;
  from: OrderedRelationshipPosition;
  to: OrderedRelationshipPosition;
};

export type OrderedRelationshipDelta = RelationshipDelta & {
  moved: OrderedRelationshipMove[];
};

type AnyRelationshipCommand =
  | RelationshipCommand
  | ManyToManyRelationshipCommand
  | OrderedRelationshipCommand;

export type RelationshipDelta = {
  added: RelationshipFact[];
  removed: RelationshipFact[];
};

export type ExecutableRelationshipCommand<
  TCommand extends AnyRelationshipCommand,
  TError = never,
  TOptions = undefined,
  TResult = RelationshipCommandResult,
> = TCommand & {
  run: (options?: TOptions) => Effect.Effect<TResult, TError>;
};

type RelationTargetRef<TRelation extends RelationDefinition> = EntityRef<
  TRelation['target']['name']
>;

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

export type RuntimeBoundEntityRefRelationshipCommands<
  TEntity extends AnyEntityDefinition,
  TError = never,
  TOptions = undefined,
  TResult = RelationshipCommandResult,
> = BoundEntityRefRelationshipCommands<
  TEntity,
  ExecutableRelationshipCommand<RelationshipCommand, TError, TOptions, TResult>,
  ExecutableRelationshipCommand<ManyToManyRelationshipCommand, TError, TOptions, TResult>,
  ExecutableRelationshipCommand<OrderedRelationshipCommand, TError, TOptions, TResult>
>;

export interface RelationshipCommandExecutionRuntime<
  TError = never,
  TOptions = undefined,
  TResult = RelationshipCommandResult,
> {
  runRelationshipCommand(
    command: RelationshipCommand,
    options?: TOptions,
  ): import('effect').Effect.Effect<TResult, TError>;
}

export interface ManyToManyRelationshipCommandExecutionRuntime<
  TError = never,
  TOptions = undefined,
  TResult = RelationshipCommandResult,
> {
  runManyToManyRelationshipCommand(
    command: ManyToManyRelationshipCommand,
    options?: TOptions,
  ): import('effect').Effect.Effect<TResult, TError>;
}

export interface OrderedRelationshipCommandExecutionRuntime<
  TError = never,
  TOptions = undefined,
  TResult = RelationshipCommandResult,
> {
  runOrderedRelationshipCommand(
    command: OrderedRelationshipCommand,
    options?: TOptions,
  ): import('effect').Effect.Effect<TResult, TError>;
}

export type RelationshipCommandExecutor<
  TError = never,
  TOptions = undefined,
  TResult = RelationshipCommandResult,
> = RelationshipCommandExecutionRuntime<TError, TOptions, TResult> &
  ManyToManyRelationshipCommandExecutionRuntime<TError, TOptions, TResult> &
  Partial<OrderedRelationshipCommandExecutionRuntime<TError, TOptions, TResult>>;

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

  const targetField =
    definition.relationKind === 'hasMany'
      ? resolveHasManyTargetField(entity, definition)
      : undefined;
  if (definition.relationKind === 'hasMany' && targetField) {
    return {
      definition,
      identity: {
        sourceEntityName: definition.target.name,
        fieldName: targetField,
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

export const resolveCanonicalRelationshipIdentity = (
  entity: AnyEntityDefinition,
  relationName: string,
):
  | CanonicalRelationIdentity
  | CanonicalManyToManyRelationIdentity
  | CanonicalOrderedRelationIdentity => {
  const definition = entity.relations[relationName];
  if (definition?.relationKind === 'hasMany' && definition.ordered) {
    return {
      sourceEntityName: entity.name,
      relationName,
      targetEntityName: definition.target.name,
      cardinality: 'ordered-many',
    } as CanonicalOrderedRelationIdentity;
  }
  if (definition?.relationKind === 'manyToMany') {
    return {
      sourceEntityName: entity.name,
      relationName,
      targetEntityName: definition.target.name,
      cardinality: 'many-to-many',
    };
  }
  return resolveRelation(entity, relationName).identity;
};

const orderedRelationship = (
  entity: AnyEntityDefinition,
  relationName: string,
  source: AnyEntityRef,
) => {
  const definition = entity.relations[relationName];
  if (definition?.relationKind !== 'hasMany' || !definition.ordered) {
    throw new Error(`Relation ${entity.name}.${relationName} is not an ordered hasMany.`);
  }
  assertRefEntity(source, entity, 'relationship subject');
  const relation: CanonicalOrderedRelationIdentity = {
    sourceEntityName: entity.name,
    relationName,
    targetEntityName: definition.target.name,
    cardinality: 'ordered-many',
  };
  const move = (
    member: AnyEntityRef,
    position: OrderedRelationshipPlacement,
    options?: OrderedRelationshipMoveOptions,
  ): OrderedRelationshipCommand => {
    assertRefEntity(member, definition.target, 'ordered member');
    const anchor =
      'before' in position ? position.before : 'after' in position ? position.after : undefined;
    if (anchor) assertRefEntity(anchor, definition.target, 'ordered anchor');
    if (options?.onMismatch && !options.ifPosition) {
      throw new Error('Ordered Relationship onMismatch requires ifPosition.');
    }
    for (const neighbor of options?.ifPosition
      ? [options.ifPosition.before, options.ifPosition.after]
      : []) {
      if (neighbor) assertRefEntity(neighbor, definition.target, 'ordered precondition neighbor');
    }
    return {
      kind: 'ordered-relationship-command',
      action: 'move',
      relation,
      source,
      member,
      position,
      ...(options?.ifPosition
        ? {
            precondition: {
              position: options.ifPosition,
              ...(options.onMismatch ? { onMismatch: options.onMismatch } : {}),
            },
          }
        : {}),
    };
  };

  return {
    move,
    append: (member: AnyEntityRef, options?: OrderedRelationshipMoveOptions) =>
      move(member, { at: 'end' }, options),
    prepend: (member: AnyEntityRef, options?: OrderedRelationshipMoveOptions) =>
      move(member, { at: 'start' }, options),
    before: (
      member: AnyEntityRef,
      anchor: AnyEntityRef,
      options?: OrderedRelationshipMoveOptions,
    ) => move(member, { before: anchor }, options),
    after: (member: AnyEntityRef, anchor: AnyEntityRef, options?: OrderedRelationshipMoveOptions) =>
      move(member, { after: anchor }, options),
  };
};

const assertRefEntity = (ref: AnyEntityRef, entity: AnyEntityDefinition, role: string) => {
  if (ref.entityName !== entity.name) {
    throw new Error(`Expected ${role} Ref for ${entity.name}, got ${ref.entityName}.`);
  }
};

type DynamicRelationshipCommandOperations = {
  assign: (
    target: AnyEntityRef,
    options?: { ifCurrent: AnyEntityRef; onMismatch?: 'fail' | 'skip' },
  ) => RelationshipCommand;
  clear: () => RelationshipCommand;
  add: (source: AnyEntityRef) => RelationshipCommand;
  remove: (source: AnyEntityRef) => RelationshipCommand;
  move: (
    member: AnyEntityRef,
    position: OrderedRelationshipPlacement,
    options?: OrderedRelationshipMoveOptions,
  ) => OrderedRelationshipCommand;
  append: (
    member: AnyEntityRef,
    options?: OrderedRelationshipMoveOptions,
  ) => OrderedRelationshipCommand;
  prepend: (
    member: AnyEntityRef,
    options?: OrderedRelationshipMoveOptions,
  ) => OrderedRelationshipCommand;
  before: (
    member: AnyEntityRef,
    anchor: AnyEntityRef,
    options?: OrderedRelationshipMoveOptions,
  ) => OrderedRelationshipCommand;
  after: (
    member: AnyEntityRef,
    anchor: AnyEntityRef,
    options?: OrderedRelationshipMoveOptions,
  ) => OrderedRelationshipCommand;
};

type RelationshipCommandOperationsFor<
  TEntity extends AnyEntityDefinition,
  TRelationName extends string,
> = TRelationName extends keyof TEntity['relations']
  ? BoundRelationshipCommandOperations<TEntity['relations'][TRelationName]>
  : DynamicRelationshipCommandOperations;

export function relationship<TEntity extends AnyEntityDefinition, TRelationName extends string>(
  entity: TEntity,
  relationName: TRelationName,
  subject: AnyEntityRef,
): RelationshipCommandOperationsFor<TEntity, TRelationName>;
export function relationship(
  entity: AnyEntityDefinition,
  relationName: string,
  subject: AnyEntityRef,
) {
  if (entity.relations[relationName]?.ordered) {
    return orderedRelationship(entity, relationName, subject);
  }
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
    assign: (
      target: AnyEntityRef,
      options?: { ifCurrent: AnyEntityRef; onMismatch?: 'fail' | 'skip' },
    ) => {
      assertDirection('forward', 'assign');
      if (options) assertRefEntity(options.ifCurrent, resolved.targetEntity, 'current target');
      return {
        ...command('link', target),
        ...(options
          ? {
              precondition: {
                currentTarget: options.ifCurrent,
                ...(options.onMismatch === undefined ? {} : { onMismatch: options.onMismatch }),
              },
            }
          : {}),
      };
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
}

type EntityRefRelationshipCommandsForExecutor<TEntity extends AnyEntityDefinition, TExecutor> = [
  TExecutor,
] extends [undefined]
  ? BoundEntityRefRelationshipCommands<TEntity>
  : RuntimeBoundEntityRefRelationshipCommands<
      TEntity,
      TExecutor extends RelationshipCommandExecutor<infer TError, any, any> ? TError : never,
      TExecutor extends RelationshipCommandExecutor<any, infer TOptions, any>
        ? TOptions
        : undefined,
      TExecutor extends RelationshipCommandExecutor<any, any, infer TResult>
        ? TResult
        : RelationshipDelta
    >;

const bindExecutableRelationshipCommand = <
  TCommand extends AnyRelationshipCommand,
  TError,
  TOptions,
  TResult,
>(
  command: TCommand,
  executor: RelationshipCommandExecutor<TError, TOptions, TResult>,
): ExecutableRelationshipCommand<TCommand, TError, TOptions, TResult> => {
  Object.defineProperty(command, 'run', {
    configurable: true,
    enumerable: false,
    value: (options?: TOptions) => {
      if (command.kind === 'relationship-command') {
        return executor.runRelationshipCommand(command, options);
      }
      if (command.kind === 'many-to-many-relationship-command') {
        return executor.runManyToManyRelationshipCommand(command, options);
      }
      if (!executor.runOrderedRelationshipCommand) {
        throw new Error(
          'The current Data Graph runtime does not support ordered Relationship Commands.',
        );
      }
      return executor.runOrderedRelationshipCommand(command, options);
    },
    writable: true,
  });

  return command as ExecutableRelationshipCommand<TCommand, TError, TOptions, TResult>;
};

export const bindEntityRefRelationshipCommands = <
  TEntity extends AnyEntityDefinition,
  TRef extends AnyEntityRef,
  TExecutor extends RelationshipCommandExecutor<any, any, any> | undefined = undefined,
>(
  ref: TRef,
  entity: TEntity,
  executor?: TExecutor,
): TRef & EntityRefRelationshipCommandsForExecutor<TEntity, TExecutor> => {
  const bindCommand = <TCommand extends AnyRelationshipCommand>(command: TCommand) =>
    executor ? bindExecutableRelationshipCommand(command, executor) : command;
  const bindDirectOperations = (relationName: string) => {
    const direct = relationship(entity, relationName, ref) as DynamicRelationshipCommandOperations;

    return {
      assign: (
        target: AnyEntityRef,
        options?: { ifCurrent: AnyEntityRef; onMismatch?: 'fail' | 'skip' },
      ) => bindCommand(direct.assign(target, options)),
      clear: () => bindCommand(direct.clear()),
      add: (source: AnyEntityRef) => bindCommand(direct.add(source)),
      remove: (source: AnyEntityRef) => bindCommand(direct.remove(source)),
    };
  };
  const bindOrderedOperations = (relationName: string) => {
    const ordered = relationship(entity, relationName, ref) as DynamicRelationshipCommandOperations;

    return {
      move: (
        member: AnyEntityRef,
        position: OrderedRelationshipPlacement,
        options?: OrderedRelationshipMoveOptions,
      ) => bindCommand(ordered.move(member, position, options)),
      append: (member: AnyEntityRef, options?: OrderedRelationshipMoveOptions) =>
        bindCommand(ordered.append(member, options)),
      prepend: (member: AnyEntityRef, options?: OrderedRelationshipMoveOptions) =>
        bindCommand(ordered.prepend(member, options)),
      before: (
        member: AnyEntityRef,
        anchor: AnyEntityRef,
        options?: OrderedRelationshipMoveOptions,
      ) => bindCommand(ordered.before(member, anchor, options)),
      after: (
        member: AnyEntityRef,
        anchor: AnyEntityRef,
        options?: OrderedRelationshipMoveOptions,
      ) => bindCommand(ordered.after(member, anchor, options)),
    };
  };

  for (const [relationName, definition] of Object.entries(entity.relations)) {
    const operations =
      definition.relationKind === 'manyToMany'
        ? {
            add: (target: AnyEntityRef) =>
              bindCommand(relationshipSet(entity, relationName, ref).add(target)),
            remove: (target: AnyEntityRef) =>
              bindCommand(relationshipSet(entity, relationName, ref).remove(target)),
          }
        : definition.ordered
          ? bindOrderedOperations(relationName)
          : bindDirectOperations(relationName);

    Object.defineProperty(ref, relationName, {
      configurable: true,
      enumerable: false,
      value: operations,
      writable: true,
    });
  }

  return ref as TRef & EntityRefRelationshipCommandsForExecutor<TEntity, TExecutor>;
};
