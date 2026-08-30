import type { Effect } from 'effect';

import type { AnyEntityDefinition, InferEntityMutationRecord } from './definitions.js';
import {
  mutateEntity,
  type CreateEntityMutationCommand,
  type DeleteEntityMutationCommand,
  type EntityMutationCommand,
  type EntityMutationCommandExecutionRuntime,
  type EntityMutationDelta,
  type UpdateEntityMutationCommand,
} from './entity-mutation-command.js';
import { type AnyEntityRef, type EntityRef, type EntityRefLocator } from './ref/index.js';

export type ExecutableEntityMutationCommand<
  TCommand extends EntityMutationCommand = EntityMutationCommand,
  TError = never,
  TOptions = undefined,
> = TCommand & {
  run: (options?: TOptions) => Effect.Effect<EntityMutationDelta, TError>;
};

type CommandForExecutor<
  TCommand extends EntityMutationCommand,
  TExecutor extends EntityMutationCommandExecutionRuntime<any, any> | undefined,
> = [TExecutor] extends [undefined]
  ? TCommand
  : TExecutor extends EntityMutationCommandExecutionRuntime<infer TError, infer TOptions>
    ? ExecutableEntityMutationCommand<TCommand, TError, TOptions>
    : TCommand;

export type EntityMutationAuthoring<
  TEntity extends AnyEntityDefinition,
  TExecutor extends EntityMutationCommandExecutionRuntime<any, any> | undefined = undefined,
> = {
  create: (
    values: InferEntityMutationRecord<TEntity['fields']>,
  ) => CommandForExecutor<CreateEntityMutationCommand<TEntity['name']>, TExecutor>;
};

export type EntityRefMutationAuthoring<
  TEntity extends AnyEntityDefinition,
  TExecutor extends EntityMutationCommandExecutionRuntime<any, any> | undefined = undefined,
> = {
  update: (
    values: Partial<InferEntityMutationRecord<TEntity['fields']>>,
  ) => CommandForExecutor<UpdateEntityMutationCommand<TEntity['name']>, TExecutor>;
  delete: () => CommandForExecutor<DeleteEntityMutationCommand<TEntity['name']>, TExecutor>;
};

const bindExecutableEntityMutationCommand = <
  TCommand extends EntityMutationCommand,
  TError,
  TOptions,
>(
  command: TCommand,
  executor: EntityMutationCommandExecutionRuntime<TError, TOptions>,
): ExecutableEntityMutationCommand<TCommand, TError, TOptions> => {
  Object.defineProperty(command, 'run', {
    configurable: true,
    enumerable: false,
    value: (options?: TOptions) => executor.runEntityMutationCommand(command, options),
    writable: true,
  });
  return command as ExecutableEntityMutationCommand<TCommand, TError, TOptions>;
};

const bindCommandForExecutor = <
  TCommand extends EntityMutationCommand,
  TExecutor extends EntityMutationCommandExecutionRuntime<any, any> | undefined,
>(
  command: TCommand,
  executor?: TExecutor,
): CommandForExecutor<TCommand, TExecutor> =>
  (executor
    ? bindExecutableEntityMutationCommand(command, executor)
    : command) as CommandForExecutor<TCommand, TExecutor>;

export const createEntityMutationAuthoring = <
  TEntity extends AnyEntityDefinition,
  TExecutor extends EntityMutationCommandExecutionRuntime<any, any> | undefined = undefined,
>(
  entity: TEntity,
  executor?: TExecutor,
): EntityMutationAuthoring<TEntity, TExecutor> => {
  const mutation = mutateEntity(entity);
  return {
    create: values => bindCommandForExecutor(mutation.create(values), executor),
  };
};

export const bindEntityRefMutationAuthoring = <
  TEntity extends AnyEntityDefinition,
  TRef extends EntityRef<TEntity['name']>,
  TExecutor extends EntityMutationCommandExecutionRuntime<any, any> | undefined = undefined,
>(
  ref: TRef,
  entity: TEntity,
  executor?: TExecutor,
): TRef & EntityRefMutationAuthoring<TEntity, TExecutor> => {
  const mutation = mutateEntity(entity);
  Object.defineProperties(ref, {
    update: {
      configurable: true,
      enumerable: false,
      value: (values: Partial<InferEntityMutationRecord<TEntity['fields']>>) =>
        bindCommandForExecutor(mutation.update(ref, values), executor),
      writable: true,
    },
    delete: {
      configurable: true,
      enumerable: false,
      value: () => bindCommandForExecutor(mutation.delete(ref), executor),
      writable: true,
    },
  });
  return ref as TRef & EntityRefMutationAuthoring<TEntity, TExecutor>;
};

export type RuntimeBoundEntityRefMutationAuthoring<
  TEntity extends AnyEntityDefinition,
  TError,
  TOptions,
> = EntityRefMutationAuthoring<TEntity, EntityMutationCommandExecutionRuntime<TError, TOptions>>;

export type RuntimeBoundEntityMutationAuthoring<
  TEntity extends AnyEntityDefinition,
  TError,
  TOptions,
> = EntityMutationAuthoring<TEntity, EntityMutationCommandExecutionRuntime<TError, TOptions>>;

type RuntimeBoundClientEntityRef<
  TRef extends AnyEntityRef,
  TEntity extends AnyEntityDefinition,
  TError,
  TOptions,
> = Omit<TRef, keyof EntityRefMutationAuthoring<TEntity>> &
  RuntimeBoundEntityRefMutationAuthoring<TEntity, TError, TOptions>;

type RuntimeBoundEntityMutationClientMember<
  TMember,
  TEntity extends AnyEntityDefinition,
  TError,
  TOptions,
> = TMember extends (...args: infer TArgs) => infer TResult
  ? TResult extends EntityMutationCommand
    ? (...args: TArgs) => ExecutableEntityMutationCommand<TResult, TError, TOptions>
    : TResult extends AnyEntityRef
      ? (...args: TArgs) => RuntimeBoundClientEntityRef<TResult, TEntity, TError, TOptions>
      : TMember
  : TMember;

export type RuntimeBoundEntityMutationClientFacade<
  TClientEntity,
  TEntity extends AnyEntityDefinition,
  TError,
  TOptions,
> = {
  [TKey in keyof TClientEntity]: RuntimeBoundEntityMutationClientMember<
    TClientEntity[TKey],
    TEntity,
    TError,
    TOptions
  >;
} & RuntimeBoundEntityMutationAuthoring<TEntity, TError, TOptions>;

export const bindRuntimeEntityMutationClientFacade = <
  TClientEntity extends {
    ref: (locator: EntityRefLocator) => AnyEntityRef;
  },
  TEntity extends AnyEntityDefinition,
  TError,
  TOptions,
>(
  clientEntity: TClientEntity,
  entity: TEntity,
  executor: EntityMutationCommandExecutionRuntime<TError, TOptions>,
): RuntimeBoundEntityMutationClientFacade<TClientEntity, TEntity, TError, TOptions> => {
  const clientSurface = clientEntity as TClientEntity & Record<string, unknown>;
  const bindMutationRef = (ref: AnyEntityRef) =>
    bindEntityRefMutationAuthoring(
      ref as typeof ref & { entityName: typeof entity.name },
      entity,
      executor,
    );
  const createPortableRef = (locator: EntityRefLocator) => clientEntity.ref(locator);
  const boundLocators = Object.fromEntries(
    Object.keys(entity.refLocators).map(name => [
      name,
      (...args: readonly unknown[]) => {
        const ref = (clientSurface[name] as (...args: readonly unknown[]) => AnyEntityRef)(...args);
        return bindMutationRef(ref);
      },
    ]),
  );

  return Object.assign({}, clientEntity, createEntityMutationAuthoring(entity, executor), {
    ref: (locator: EntityRefLocator) => bindMutationRef(createPortableRef(locator)),
    ...boundLocators,
  }) as RuntimeBoundEntityMutationClientFacade<TClientEntity, TEntity, TError, TOptions>;
};
