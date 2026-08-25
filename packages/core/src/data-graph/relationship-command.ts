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

export type RelationshipDelta = {
  added: RelationshipFact[];
  removed: RelationshipFact[];
};

export type ExecutableRelationshipCommand<
  TCommand extends RelationshipCommand | ManyToManyRelationshipCommand,
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
      ? {
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
> = {
  [TRelationName in keyof TEntity['relations']]: BoundRelationshipCommandOperations<
    TEntity['relations'][TRelationName],
    TDirectCommand,
    TManyToManyCommand
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
  ExecutableRelationshipCommand<ManyToManyRelationshipCommand, TError, TOptions, TResult>
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

export type RelationshipCommandExecutor<
  TError = never,
  TOptions = undefined,
  TResult = RelationshipCommandResult,
> = RelationshipCommandExecutionRuntime<TError, TOptions, TResult> &
  ManyToManyRelationshipCommandExecutionRuntime<TError, TOptions, TResult>;

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
): CanonicalRelationIdentity | CanonicalManyToManyRelationIdentity => {
  const definition = entity.relations[relationName];
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
};

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
  TCommand extends RelationshipCommand | ManyToManyRelationshipCommand,
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
    value: (options?: TOptions) =>
      command.kind === 'relationship-command'
        ? executor.runRelationshipCommand(command, options)
        : executor.runManyToManyRelationshipCommand(command, options),
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
  const bindCommand = <TCommand extends RelationshipCommand | ManyToManyRelationshipCommand>(
    command: TCommand,
  ) => (executor ? bindExecutableRelationshipCommand(command, executor) : command);
  const bindDirectOperations = (relationName: string) => {
    const direct = relationship(entity, relationName, ref);

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

  for (const [relationName, definition] of Object.entries(entity.relations)) {
    const operations =
      definition.relationKind === 'manyToMany'
        ? {
            add: (target: AnyEntityRef) =>
              bindCommand(relationshipSet(entity, relationName, ref).add(target)),
            remove: (target: AnyEntityRef) =>
              bindCommand(relationshipSet(entity, relationName, ref).remove(target)),
          }
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
