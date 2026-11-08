import { hasOwn, isPlainObject, isRecord } from '../../value/object.js';
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

const isReceiverSchema = (schema: unknown, entityName: string): boolean => {
  if (!isRecord(schema)) return false;
  if (schema.kind === 'schema.optional' || schema.kind === 'schema.nullable') {
    return isReceiverSchema(schema.item, entityName);
  }
  return (
    schema.kind === 'field' &&
    schema.fieldType === 'reference' &&
    (schema.referenceRequirement === 'portable' || schema.referenceRequirement === 'existing') &&
    isRecord(schema.target) &&
    schema.target.name === entityName
  );
};

type InputReceiverDescriptor = {
  kind: 'input';
  path: string;
  entityName: string;
  source: 'declaration' | 'legacy-graph-ops';
};

const readInputReceiverDescriptor = (operation: unknown): InputReceiverDescriptor | undefined => {
  if (typeof operation !== 'function' && !isRecord(operation)) return undefined;
  const receiver = (operation as { receiver?: unknown }).receiver;
  return isRecord(receiver) &&
    receiver.kind === 'input' &&
    typeof receiver.path === 'string' &&
    typeof receiver.entityName === 'string' &&
    (receiver.source === 'declaration' || receiver.source === 'legacy-graph-ops')
    ? (receiver as InputReceiverDescriptor)
    : undefined;
};

const hasNonInputReceiverDescriptor = (operation: unknown): boolean => {
  if (typeof operation !== 'function' && !isRecord(operation)) return false;
  const receiver = (operation as { receiver?: unknown }).receiver;
  return isRecord(receiver) && receiver.kind !== 'input';
};

const sameLocatorValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameLocatorValue(value, right[index]))
    );
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(key => hasOwn(right, key) && sameLocatorValue(left[key], right[key]))
  );
};

const sameEntityRef = (left: AnyEntityRef, right: unknown): boolean =>
  isRecord(right) &&
  right.kind === 'entity-ref' &&
  right.entityName === left.entityName &&
  sameLocatorValue(right.locator, left.locator);

const getDeclaredEntityRefOperationInput = (
  ref: AnyEntityRef,
  receiver: InputReceiverDescriptor,
  args: readonly unknown[],
): Record<string, unknown> => {
  const [input] = args;
  const remaining = input === undefined ? {} : input;
  if (!isPlainObject(remaining)) {
    throw new TypeError(`Bound ${receiver.entityName} Operation arguments must be an object.`);
  }
  if (hasOwn(remaining, receiver.path)) {
    if (receiver.source === 'declaration') {
      throw new TypeError(
        `Bound ${receiver.entityName} Operation arguments must not supply receiver "${receiver.path}".`,
      );
    }
    if (!sameEntityRef(ref, remaining[receiver.path])) {
      throw new TypeError(
        `Legacy bound ${receiver.entityName} Operation receiver "${receiver.path}" cannot redirect to another Entity Ref.`,
      );
    }
  }
  return { ...remaining, [receiver.path]: ref };
};

const getEntityRefOperationInput = (
  ref: AnyEntityRef,
  operation: unknown,
  args: readonly unknown[],
): Record<string, unknown> => {
  const declaredReceiver = readInputReceiverDescriptor(operation);
  if (declaredReceiver) {
    if (declaredReceiver.entityName === ref.entityName) {
      return getDeclaredEntityRefOperationInput(ref, declaredReceiver, args);
    }
    if (declaredReceiver.source === 'declaration') {
      throw new TypeError(
        `Cannot bind ${ref.entityName} Ref to ${declaredReceiver.entityName} receiver "${declaredReceiver.path}".`,
      );
    }
    // A legacy graphOps receiver may have described Explorer projection while callers historically
    // used another uniquely matching participant through the Ref facade. Preserve that inference.
  } else if (hasNonInputReceiverDescriptor(operation)) {
    throw new TypeError(`Entity-type Operations cannot be bound to an Entity Ref.`);
  }
  const schema =
    (isRecord(operation) || typeof operation === 'function') && 'input' in operation
      ? operation.input
      : undefined;
  const fields =
    isRecord(schema) && (schema.kind === 'value' || schema.kind === 'schema.object')
      ? schema.fields
      : undefined;
  const receivers = isRecord(fields)
    ? Object.keys(fields).filter(name => isReceiverSchema(fields[name], ref.entityName))
    : [];
  if (receivers.length > 1) {
    throw new TypeError(
      `Ambiguous ${ref.entityName} receiver (${receivers.join(', ')}). Invoke the Operation with explicit participant inputs.`,
    );
  }
  if (receivers.length === 0) return getDefaultEntityRefOperationInput(ref, args);
  return { [receivers[0]]: ref, ...(isLocatorObject(args[0]) ? args[0] : {}) };
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
      if (
        typeof property !== 'string' ||
        Reflect.getOwnPropertyDescriptor(target, property) !== undefined ||
        !(property in operations)
      ) {
        return Reflect.get(target, property, receiver);
      }

      const operationName = property as keyof TOperations & string;

      return (...args: readonly unknown[]) =>
        options.run({
          ref,
          operationName,
          operation: operations[operationName],
          input: options.input
            ? readInputReceiverDescriptor(operations[operationName])?.source === 'declaration'
              ? getEntityRefOperationInput(ref, operations[operationName], [
                  options.input({ ref, operationName, args }),
                ])
              : options.input({ ref, operationName, args })
            : getEntityRefOperationInput(ref, operations[operationName], args),
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
              input:
                readInputReceiverDescriptor(operation)?.source === 'declaration'
                  ? getEntityRefOperationInput(ref, operation, [input])
                  : { [options.receiver]: ref, ...input },
            }),
        ]),
      ),
    },
  }) as BoundEntityRefRelation<TRef, TRelationName, TOperations, TResult>;
