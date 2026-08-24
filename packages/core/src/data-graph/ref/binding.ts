import { isPlainObject } from '../../value/object.js';
import type { AnyEntityDefinition } from '../definitions.js';

import {
  createEntityRef,
  type AnyEntityRef,
  type EntityName,
  type EntityRef,
  type EntityRefLocator,
  type EntityRefLocatorDeclarations,
} from './model.js';

export type EntityRefMethodDeclarations<
  TEntityName extends string,
  TLocator extends EntityRefLocator,
> = Record<string, (ref: EntityRef<TEntityName, TLocator>, ...args: readonly any[]) => unknown>;

export type BoundEntityRefMethods<
  TRef extends AnyEntityRef,
  TMethods extends EntityRefMethodDeclarations<TRef['entityName'], TRef['locator']>,
> = {
  [TName in keyof TMethods]: TMethods[TName] extends (
    ref: TRef,
    ...args: infer TArgs
  ) => infer TResult
    ? (...args: TArgs) => TResult
    : never;
};

export type BoundEntityRef<
  TRef extends AnyEntityRef,
  TMethods extends EntityRefMethodDeclarations<TRef['entityName'], TRef['locator']>,
> = TRef & BoundEntityRefMethods<TRef, TMethods>;

export type BoundEntityRefOperationProxy<
  TRef extends AnyEntityRef,
  TOperations extends Record<string, unknown>,
  TResult,
> = TRef & {
  [TName in keyof TOperations]: (
    ...args: readonly unknown[]
  ) => TOperations[TName] extends (...args: readonly any[]) => infer TOperationResult
    ? TOperationResult
    : TResult extends (operation: TOperations[TName], input: unknown) => infer TOperationResult
      ? TOperationResult
      : TResult;
};

export type BoundEntityRefRelationOperations<
  TOperations extends Record<string, unknown>,
  TResult,
> = {
  [TName in keyof TOperations]: (
    input?: Record<string, unknown>,
  ) => TOperations[TName] extends (...args: readonly any[]) => infer TOperationResult
    ? TOperationResult
    : TResult extends (operation: TOperations[TName], input: unknown) => infer TOperationResult
      ? TOperationResult
      : TResult;
};

export type BoundEntityRefRelation<
  TRef extends AnyEntityRef,
  TRelationName extends string,
  TOperations extends Record<string, unknown>,
  TResult,
> = TRef & {
  [TName in TRelationName]: BoundEntityRefRelationOperations<TOperations, TResult>;
};

export type BoundEntityRefRelations<
  TRelations extends Record<string, Record<string, unknown>>,
  TResult,
> = {
  [TName in keyof TRelations]: BoundEntityRefRelationOperations<TRelations[TName], TResult>;
};

export type BoundEntityRefLocators<
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TOperations extends Record<string, unknown>,
  TLocators extends EntityRefLocatorDeclarations,
  TResult,
  TRelations extends Record<string, Record<string, unknown>> = {},
  TStructuralRelations = TEntity extends AnyEntityDefinition
    ? import('../relationship-command.js').BoundEntityRefRelationshipCommands<TEntity>
    : {},
> = {
  ref: <TLocator extends EntityRefLocator>(
    locator: TLocator,
  ) => BoundEntityRefOperationProxy<
    EntityRef<EntityName<TEntity>, TLocator>,
    TOperations,
    TResult
  > &
    BoundEntityRefRelations<TRelations, TResult> &
    TStructuralRelations;
} & {
  [TName in keyof TLocators]: (
    ...args: Parameters<TLocators[TName]>
  ) => BoundEntityRefOperationProxy<
    EntityRef<EntityName<TEntity>, ReturnType<TLocators[TName]>>,
    TOperations,
    TResult
  > &
    BoundEntityRefRelations<TRelations, TResult> &
    TStructuralRelations;
};

export function createEntityRefFactory<
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TLocator extends EntityRefLocator,
>(entityOrName: TEntity): (locator: TLocator) => EntityRef<EntityName<TEntity>, TLocator>;
export function createEntityRefFactory<
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TLocator extends EntityRefLocator,
  TMethods extends EntityRefMethodDeclarations<EntityName<TEntity>, TLocator>,
>(
  entityOrName: TEntity,
  methods: TMethods,
): (locator: TLocator) => BoundEntityRef<EntityRef<EntityName<TEntity>, TLocator>, TMethods>;
export function createEntityRefFactory<
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TLocator extends EntityRefLocator,
  TMethods extends EntityRefMethodDeclarations<EntityName<TEntity>, TLocator>,
>(entityOrName: TEntity, methods?: TMethods) {
  return (locator: TLocator) => {
    const ref = createEntityRef(entityOrName, locator);

    return methods
      ? bindEntityRefMethods(ref, methods)
      : (ref as EntityRef<EntityName<TEntity>, TLocator>);
  };
}

export const bindEntityRefMethods = <
  TRef extends AnyEntityRef,
  TMethods extends EntityRefMethodDeclarations<TRef['entityName'], TRef['locator']>,
>(
  ref: TRef,
  methods: TMethods,
): BoundEntityRef<TRef, TMethods> =>
  Object.assign(
    ref,
    Object.fromEntries(
      Object.entries(methods).map(([name, method]) => [
        name,
        (...args: readonly unknown[]) => method(ref, ...args),
      ]),
    ) as BoundEntityRefMethods<TRef, TMethods>,
  );

export const pickEntityRefOperations = <
  TOperations extends Record<string, unknown>,
  TNames extends readonly (keyof TOperations & string)[],
>(
  operations: TOperations,
  names: TNames,
): Pick<TOperations, TNames[number]> =>
  Object.fromEntries(names.map(name => [name, operations[name]])) as Pick<
    TOperations,
    TNames[number]
  >;

const isLocatorObject = (value: unknown): value is EntityRefLocator =>
  isPlainObject(value) &&
  Object.values(value).every(
    item =>
      item == null ||
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      Array.isArray(item) ||
      isPlainObject(item),
  );

export const getDefaultEntityRefOperationInput = (
  ref: AnyEntityRef,
  args: readonly unknown[],
): EntityRefLocator => {
  const [input] = args;

  return isLocatorObject(input)
    ? {
        ...ref.locator,
        ...input,
      }
    : ref.locator;
};

export const bindEntityRefOperationProxy = <
  TRef extends AnyEntityRef,
  TOperations extends Record<string, unknown>,
  TResult,
>(
  ref: TRef,
  operations: TOperations,
  options: {
    input?: (args: {
      ref: TRef;
      operationName: keyof TOperations & string;
      args: readonly unknown[];
    }) => unknown;
    run: (args: {
      ref: TRef;
      operationName: keyof TOperations & string;
      operation: TOperations[keyof TOperations];
      input: unknown;
    }) => TResult;
  },
): BoundEntityRefOperationProxy<TRef, TOperations, TResult> =>
  new Proxy(ref, {
    get(target, property, receiver) {
      if (typeof property !== 'string' || !(property in operations)) {
        return Reflect.get(target, property, receiver);
      }

      const operationName = property as keyof TOperations & string;

      return (...args: readonly unknown[]) =>
        options.run({
          ref,
          operationName,
          operation: operations[operationName],
          input: options.input
            ? options.input({ ref, operationName, args })
            : getDefaultEntityRefOperationInput(ref, args),
        });
    },
  }) as BoundEntityRefOperationProxy<TRef, TOperations, TResult>;

export const bindEntityRefRelationOperations = <
  TRef extends AnyEntityRef,
  TRelationName extends string,
  TOperations extends Record<string, unknown>,
  TResult,
>(
  ref: TRef,
  relationName: TRelationName,
  operations: TOperations,
  options: {
    receiver: string;
    run: (args: {
      ref: TRef;
      relationName: TRelationName;
      operationName: keyof TOperations & string;
      operation: TOperations[keyof TOperations];
      input: unknown;
    }) => TResult;
  },
): BoundEntityRefRelation<TRef, TRelationName, TOperations, TResult> =>
  Object.assign(ref, {
    [relationName]: {
      ...((ref as Record<string, unknown>)[relationName] as Record<string, unknown> | undefined),
      ...Object.fromEntries(
        Object.entries(operations).map(([operationName, operation]) => [
          operationName,
          (input: Record<string, unknown> = {}) =>
            options.run({
              ref,
              relationName,
              operationName: operationName as keyof TOperations & string,
              operation: operation as TOperations[keyof TOperations],
              input: {
                [options.receiver]: ref,
                ...input,
              },
            }),
        ]),
      ),
    },
  }) as BoundEntityRefRelation<TRef, TRelationName, TOperations, TResult>;
