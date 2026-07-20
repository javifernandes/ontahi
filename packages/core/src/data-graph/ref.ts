import { isPlainObject } from '../value/object.js';

import type { AnyEntityDefinition } from './definitions.js';
import type { EntityName } from './operations.js';

export type EntityRefLocatorValue =
  | string
  | number
  | boolean
  | null
  | readonly EntityRefLocatorValue[]
  | { readonly [key: string]: EntityRefLocatorValue };

export type EntityRefLocator = Record<string, EntityRefLocatorValue>;

export type EntityRefLocatorFactory = ((...args: readonly any[]) => EntityRefLocator) & {
  fields?: readonly string[];
};

export type EntityRefLocatorDeclarations = Record<string, EntityRefLocatorFactory>;

export type EntityRefInputLocator = {
  name: string;
  fields: readonly string[];
  sourceFields?: readonly string[];
  toLocator?: EntityRefLocatorFactory;
};

export type EntityRefInputResolver<TEntityName extends string = string, TResult = unknown> = (
  ref: EntityRef<TEntityName, EntityRefLocator>,
) => TResult;

export type EntityRefInputDeclaration<
  TEntityName extends string = string,
  TIsOptional extends boolean = boolean,
  TResolved = never,
> = {
  kind: 'entity-ref-input';
  entityName: TEntityName;
  isReceiver: boolean;
  isOptional: TIsOptional;
  locators: readonly EntityRefInputLocator[];
  inferredLocators: readonly EntityRefInputLocator[];
  resolver?: EntityRefInputResolver<TEntityName, TResolved>;
};

export type EntityRefInputDeclarations = Record<string, EntityRefInputDeclaration<any, any, any>>;

type RequiredEntityRefInputNames<TInputRefs extends EntityRefInputDeclarations> = {
  [TName in keyof TInputRefs]: TInputRefs[TName]['isOptional'] extends true ? never : TName;
}[keyof TInputRefs];

type OptionalEntityRefInputNames<TInputRefs extends EntityRefInputDeclarations> = {
  [TName in keyof TInputRefs]: TInputRefs[TName]['isOptional'] extends true ? TName : never;
}[keyof TInputRefs];

type EntityRefInputResolveMethod<TResolved> = [TResolved] extends [never]
  ? {}
  : {
      resolve: () => TResolved;
    };

type EntityRefInputDerivedRef<TInputRef extends EntityRefInputDeclaration<any, any, any>> =
  TInputRef extends EntityRefInputDeclaration<infer TEntityName, boolean, infer TResolved>
    ? EntityRef<TEntityName, EntityRefLocator> & EntityRefInputResolveMethod<TResolved>
    : never;

type EntityRefInputDirectRef<TInputRef extends EntityRefInputDeclaration<any, any, any>> =
  TInputRef extends EntityRefInputDeclaration<infer TEntityName, boolean, any>
    ? EntityRef<TEntityName, EntityRefLocator>
    : never;

export type EntityRefInputDerivedRefs<TInputRefs extends EntityRefInputDeclarations> = {
  [TName in RequiredEntityRefInputNames<TInputRefs>]: EntityRefInputDerivedRef<TInputRefs[TName]>;
} & {
  [TName in OptionalEntityRefInputNames<TInputRefs>]?: EntityRefInputDerivedRef<TInputRefs[TName]>;
};

export type EntityRefInputDirectRefs<TInputRefs extends EntityRefInputDeclarations> = {
  [TName in RequiredEntityRefInputNames<TInputRefs>]: EntityRefInputDirectRef<TInputRefs[TName]>;
} & {
  [TName in OptionalEntityRefInputNames<TInputRefs>]?: EntityRefInputDirectRef<TInputRefs[TName]>;
};

export type EntityRefInputPublicInput<
  TInput,
  TInputRefs extends EntityRefInputDeclarations,
> = keyof TInputRefs extends never
  ? TInput
  : string extends keyof TInputRefs
    ? TInput | (Partial<TInput> & Record<string, unknown>)
    : TInput | (Omit<TInput, keyof TInputRefs> & EntityRefInputDirectRefs<TInputRefs>);

export type EntityRefInputRunInput<
  TInput,
  TInputRefs extends EntityRefInputDeclarations,
> = keyof TInputRefs extends never
  ? TInput
  : TInput & {
      refs: EntityRefInputDerivedRefs<TInputRefs>;
    };

export type EntityRefInputBuilder<
  TEntityName extends string = string,
  TIsOptional extends boolean = boolean,
  TResolved = never,
> = EntityRefInputDeclaration<TEntityName, TIsOptional, TResolved> & {
  by: (
    name: string,
    fields?: readonly string[],
  ) => EntityRefInputBuilder<TEntityName, TIsOptional, TResolved>;
  from: (
    locatorName: string,
    fields?: readonly string[],
  ) => EntityRefInputBuilder<TEntityName, TIsOptional, TResolved>;
  receiver: () => EntityRefInputBuilder<TEntityName, TIsOptional, TResolved>;
  optional: () => EntityRefInputBuilder<TEntityName, true, TResolved>;
  resolveWith: <TNextResolved>(
    resolver: EntityRefInputResolver<TEntityName, TNextResolved>,
  ) => EntityRefInputBuilder<TEntityName, TIsOptional, TNextResolved>;
};

export type EntityRef<
  TEntityName extends string = string,
  TLocator extends EntityRefLocator = EntityRefLocator,
> = {
  kind: 'entity-ref';
  entityName: TEntityName;
  locator: TLocator;
};

export type AnyEntityRef = EntityRef<string, EntityRefLocator>;

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
> = {
  ref: <TLocator extends EntityRefLocator>(
    locator: TLocator,
  ) => BoundEntityRefOperationProxy<
    EntityRef<EntityName<TEntity>, TLocator>,
    TOperations,
    TResult
  > &
    BoundEntityRefRelations<TRelations, TResult>;
} & {
  [TName in keyof TLocators]: (
    ...args: Parameters<TLocators[TName]>
  ) => BoundEntityRefOperationProxy<
    EntityRef<EntityName<TEntity>, ReturnType<TLocators[TName]>>,
    TOperations,
    TResult
  > &
    BoundEntityRefRelations<TRelations, TResult>;
};

const resolveEntityName = <TEntity extends Pick<AnyEntityDefinition, 'name'> | string>(
  entityOrName: TEntity,
): EntityName<TEntity> =>
  (typeof entityOrName === 'string' ? entityOrName : entityOrName.name) as EntityName<TEntity>;

const resolveEntityRefLocators = (
  entityOrName: Pick<AnyEntityDefinition, 'name'> | string,
): EntityRefLocatorDeclarations =>
  typeof entityOrName === 'object' &&
  entityOrName !== null &&
  'refLocators' in entityOrName &&
  typeof entityOrName.refLocators === 'object' &&
  entityOrName.refLocators !== null
    ? (entityOrName.refLocators as EntityRefLocatorDeclarations)
    : {};

const inferableEntityRefInputLocators = (
  entityLocators: EntityRefLocatorDeclarations,
): readonly EntityRefInputLocator[] =>
  Object.entries(entityLocators).flatMap(([name, toLocator]) => {
    const sourceFields = toLocator.fields;

    return sourceFields && sourceFields.length > 0
      ? [
          {
            name,
            fields: sourceFields,
            sourceFields,
            toLocator,
          },
        ]
      : [];
  });

const createEntityRefInputBuilder = <
  TEntityName extends string,
  TIsOptional extends boolean,
  TResolved,
>(
  declaration: EntityRefInputDeclaration<TEntityName, TIsOptional, TResolved>,
  entityLocators: EntityRefLocatorDeclarations = {},
): EntityRefInputBuilder<TEntityName, TIsOptional, TResolved> => {
  Object.defineProperties(declaration, {
    by: {
      enumerable: false,
      value: (name: string, fields: readonly string[] = [name]) =>
        createEntityRefInputBuilder(
          {
            ...declaration,
            locators: [...declaration.locators, { name, fields }],
          },
          entityLocators,
        ),
    },
    from: {
      enumerable: false,
      value: (locatorName: string, fields: readonly string[] = [locatorName]) => {
        const toLocator = entityLocators[locatorName];

        if (!toLocator) {
          throw new Error(
            `Unknown locator ${locatorName} on entity ref input ${declaration.entityName}`,
          );
        }

        return createEntityRefInputBuilder(
          {
            ...declaration,
            locators: [
              ...declaration.locators,
              {
                name: locatorName,
                fields,
                sourceFields: toLocator.fields,
                toLocator,
              },
            ],
          },
          entityLocators,
        );
      },
    },
    receiver: {
      enumerable: false,
      value: () =>
        createEntityRefInputBuilder(
          {
            ...declaration,
            isReceiver: true,
          },
          entityLocators,
        ),
    },
    optional: {
      enumerable: false,
      value: () =>
        createEntityRefInputBuilder(
          {
            ...declaration,
            isOptional: true,
          },
          entityLocators,
        ),
    },
    resolveWith: {
      enumerable: false,
      value: <TNextResolved>(resolver: EntityRefInputResolver<TEntityName, TNextResolved>) =>
        createEntityRefInputBuilder(
          {
            ...declaration,
            resolver,
          },
          entityLocators,
        ),
    },
  });

  return declaration as EntityRefInputBuilder<TEntityName, TIsOptional, TResolved>;
};

export const defineEntityRefInput = <TEntity extends Pick<AnyEntityDefinition, 'name'> | string>(
  entityOrName: TEntity,
): EntityRefInputBuilder<EntityName<TEntity>, false, never> => {
  const entityLocators = resolveEntityRefLocators(entityOrName);

  return createEntityRefInputBuilder(
    {
      kind: 'entity-ref-input',
      entityName: resolveEntityName(entityOrName),
      isReceiver: false,
      isOptional: false,
      locators: [],
      inferredLocators: inferableEntityRefInputLocators(entityLocators),
    },
    entityLocators,
  );
};

const capitalizePathSegment = (value: string): string =>
  value.length === 0 ? value : `${value[0]?.toUpperCase()}${value.slice(1)}`;

const fieldPathToPascalCase = (fieldPath: string): string =>
  fieldPath.split('.').map(capitalizePathSegment).join('');

const uniqueFieldGroups = (
  groups: readonly (readonly string[])[],
): readonly (readonly string[])[] => {
  const seen = new Set<string>();

  return groups.filter(group => {
    const key = group.join('\u0000');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

export const inferEntityRefInputLocatorFieldGroups = (
  inputRefName: string,
  sourceFields: readonly string[],
): readonly (readonly string[])[] => {
  if (sourceFields.length === 0) {
    return [];
  }

  return uniqueFieldGroups([
    sourceFields.map(fieldPath =>
      fieldPath.startsWith(inputRefName)
        ? fieldPath
        : `${inputRefName}${fieldPathToPascalCase(fieldPath)}`,
    ),
    sourceFields,
    sourceFields.map(fieldPath => `${inputRefName}.${fieldPath}`),
  ]);
};

const genericLocatorFieldNames = new Set(['email', 'id', 'name', 'slug', 'token']);

const inferPreferredEntityRefInputLocatorFieldGroup = (
  inputRefName: string,
  sourceFields: readonly string[],
): readonly string[] => {
  if (sourceFields.length !== 1) {
    return sourceFields;
  }

  const [sourceField] = sourceFields;

  if (!sourceField || sourceField.startsWith(inputRefName)) {
    return sourceFields;
  }

  return genericLocatorFieldNames.has(sourceField)
    ? [`${inputRefName}${fieldPathToPascalCase(sourceField)}`]
    : sourceFields;
};

const normalizeEntityRefLocatorValue = (value: EntityRefLocatorValue): string => {
  if (Array.isArray(value)) {
    return `[${value.map(normalizeEntityRefLocatorValue).join(',')}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${normalizeEntityRefLocatorValue(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

export const isEntityRefLocatorValue = (value: unknown): value is EntityRefLocatorValue =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (Array.isArray(value) && value.every(isEntityRefLocatorValue)) ||
  (isPlainObject(value) && Object.values(value).every(isEntityRefLocatorValue));

const readInputField = (input: Record<string, unknown>, fieldPath: string): unknown =>
  fieldPath
    .split('.')
    .reduce<unknown>(
      (current, segment) =>
        isPlainObject(current) ? (current as Record<string, unknown>)[segment] : undefined,
      input,
    );

const writeInputField = (
  input: Record<string, unknown>,
  fieldPath: string,
  value: EntityRefLocatorValue,
): boolean => {
  if (!fieldPath || fieldPath.includes('.')) {
    return false;
  }

  if (!(fieldPath in input)) {
    input[fieldPath] = value;
  }

  return true;
};

const buildLocatorFromInput = (
  input: Record<string, unknown>,
  locator: EntityRefInputLocator,
): EntityRefLocator | undefined => {
  if (locator.fields.length === 0) {
    return undefined;
  }

  if (locator.fields.length === 1) {
    const value = readInputField(input, locator.fields[0]);

    if (!isEntityRefLocatorValue(value)) {
      return undefined;
    }

    return locator.toLocator ? locator.toLocator(value) : { [locator.name]: value };
  }

  const locatorEntries = locator.fields.flatMap(fieldPath => {
    const value = readInputField(input, fieldPath);
    const locatorField = fieldPath.split('.').at(-1);

    return locatorField && isEntityRefLocatorValue(value) ? [[locatorField, value] as const] : [];
  });

  if (locatorEntries.length !== locator.fields.length) {
    return undefined;
  }

  return locator.toLocator
    ? locator.toLocator(...locatorEntries.map(([, value]) => value))
    : Object.fromEntries(locatorEntries);
};

const resolveEntityRefInputLocators = (
  inputRefName: string,
  inputRef: EntityRefInputDeclaration<any, any, any>,
): readonly EntityRefInputLocator[] => {
  if (inputRef.locators.length > 0) {
    return inputRef.locators;
  }

  return inputRef.inferredLocators.flatMap(locator => {
    const sourceFields = locator.sourceFields ?? locator.fields;

    return inferEntityRefInputLocatorFieldGroups(inputRefName, sourceFields).map(fields => ({
      ...locator,
      fields,
    }));
  });
};

const isEntityRefForInput = (
  value: unknown,
  inputRef: EntityRefInputDeclaration<any, any, any>,
): value is AnyEntityRef => isEntityRef(value) && value.entityName === inputRef.entityName;

const readDirectInputRef = (
  input: Record<string, unknown>,
  inputRefName: string,
  inputRef: EntityRefInputDeclaration<any, any, any>,
): AnyEntityRef | undefined => {
  const value = readInputField(input, inputRefName);

  return isEntityRefForInput(value, inputRef) ? value : undefined;
};

const applyEntityRefLocatorFields = (
  input: Record<string, unknown>,
  inputRefName: string,
  inputRef: EntityRefInputDeclaration<any, any, any>,
  ref: AnyEntityRef,
): boolean => {
  let applied = false;

  for (const locator of resolveEntityRefInputLocators(inputRefName, inputRef)) {
    const sourceFields = locator.sourceFields ?? locator.fields;
    const values = sourceFields.map(sourceField => ref.locator[sourceField]);

    if (values.some(value => !isEntityRefLocatorValue(value))) {
      continue;
    }

    for (const fieldGroup of inferEntityRefInputLocatorFieldGroups(inputRefName, sourceFields)) {
      fieldGroup.forEach((fieldPath, index) => {
        applied =
          writeInputField(input, fieldPath, values[index] as EntityRefLocatorValue) || applied;
      });
    }
  }

  return applied;
};

const applyEntityRefQueryLocatorFields = (
  input: Record<string, unknown>,
  inputRefName: string,
  inputRef: EntityRefInputDeclaration<any, any, any>,
  ref: AnyEntityRef,
): boolean => {
  const locators =
    inputRef.locators.length > 0
      ? inputRef.locators
      : inputRef.inferredLocators.map(locator => ({
          ...locator,
          fields: inferPreferredEntityRefInputLocatorFieldGroup(
            inputRefName,
            locator.sourceFields ?? locator.fields,
          ),
        }));
  let applied = false;

  for (const locator of locators) {
    const sourceFields = locator.sourceFields ?? locator.fields;
    const values = sourceFields.map(sourceField => ref.locator[sourceField]);

    if (values.some(value => !isEntityRefLocatorValue(value))) {
      continue;
    }

    locator.fields.forEach((fieldPath, index) => {
      applied =
        writeInputField(input, fieldPath, values[index] as EntityRefLocatorValue) || applied;
    });
  }

  return applied;
};

const applyGenericEntityRefQueryLocatorFields = (
  input: Record<string, unknown>,
  inputRefName: string,
  ref: AnyEntityRef,
): boolean => {
  const sourceFields = Object.keys(ref.locator);
  const values = sourceFields.map(sourceField => ref.locator[sourceField]);

  if (sourceFields.length === 0 || values.some(value => !isEntityRefLocatorValue(value))) {
    return false;
  }

  let applied = false;

  inferPreferredEntityRefInputLocatorFieldGroup(inputRefName, sourceFields).forEach(
    (fieldPath, index) => {
      applied =
        writeInputField(input, fieldPath, values[index] as EntityRefLocatorValue) || applied;
    },
  );

  return applied;
};

const readEntityRefQueryLocatorValue = (
  input: Record<string, unknown>,
  locator: Pick<EntityRefInputLocator, 'fields'>,
): EntityRefLocatorValue | EntityRefLocator | undefined => {
  const values = locator.fields.map(fieldPath => readInputField(input, fieldPath));

  if (values.some(value => !isEntityRefLocatorValue(value))) {
    return undefined;
  }

  if (values.length === 1) {
    return values[0] as EntityRefLocatorValue;
  }

  return Object.fromEntries(
    locator.fields.map((fieldPath, index) => [
      fieldPath.split('.').at(-1) ?? fieldPath,
      values[index] as EntityRefLocatorValue,
    ]),
  );
};

export const readEntityRefQueryInputValue = (
  input: unknown,
  inputRefName: string,
  inputRef?: EntityRefInputDeclaration<any, any, any>,
): string | EntityRefLocatorValue | EntityRefLocator | undefined => {
  if (!isPlainObject(input)) {
    return undefined;
  }

  const directRef = inputRef
    ? readDirectInputRef(input, inputRefName, inputRef)
    : isEntityRef(readInputField(input, inputRefName))
      ? (readInputField(input, inputRefName) as AnyEntityRef)
      : undefined;

  if (directRef) {
    return normalizeEntityRef(directRef);
  }

  if (inputRef) {
    const locators =
      inputRef.locators.length > 0
        ? inputRef.locators
        : inputRef.inferredLocators.map(locator => ({
            ...locator,
            fields: inferPreferredEntityRefInputLocatorFieldGroup(
              inputRefName,
              locator.sourceFields ?? locator.fields,
            ),
          }));

    for (const locator of locators) {
      const value = readEntityRefQueryLocatorValue(input, locator);

      if (value !== undefined) {
        return value;
      }
    }
  }

  for (const sourceField of genericLocatorFieldNames) {
    const fieldPath = `${inputRefName}${fieldPathToPascalCase(sourceField)}`;
    const value = readInputField(input, fieldPath);

    if (isEntityRefLocatorValue(value)) {
      return value;
    }
  }

  const nested = readInputField(input, inputRefName);

  if (isEntityRefLocatorValue(nested)) {
    return nested;
  }

  return undefined;
};

export const normalizeEntityRefInput = <
  TInput extends object,
  TInputRefs extends EntityRefInputDeclarations,
>(
  input: TInput,
  inputRefs: TInputRefs | undefined,
): TInput => {
  if (Object.keys(inputRefs ?? {}).length === 0 || !isPlainObject(input)) {
    return input;
  }

  const normalized = { ...(input as Record<string, unknown>) };

  for (const [name, inputRef] of Object.entries(inputRefs ?? {})) {
    const directRef = readDirectInputRef(normalized, name, inputRef);

    if (directRef) {
      applyEntityRefLocatorFields(normalized, name, inputRef, directRef);
    }
  }

  return normalized as TInput;
};

export const normalizeEntityRefQueryInput = <
  TInput,
  TInputRefs extends EntityRefInputDeclarations = EntityRefInputDeclarations,
>(
  input: TInput,
  inputRefs?: TInputRefs,
): TInput => {
  if (!isPlainObject(input)) {
    return input;
  }

  const normalized = { ...(input as Record<string, unknown>) };
  const projectedRefFields = new Set<string>();

  for (const [name, inputRef] of Object.entries(inputRefs ?? {})) {
    const directRef = readDirectInputRef(normalized, name, inputRef);

    if (directRef && applyEntityRefQueryLocatorFields(normalized, name, inputRef, directRef)) {
      projectedRefFields.add(name);
    }
  }

  for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
    if (isEntityRef(value) && applyGenericEntityRefQueryLocatorFields(normalized, name, value)) {
      projectedRefFields.add(name);
    }
  }

  for (const name of projectedRefFields) {
    delete normalized[name];
  }

  return normalized as TInput;
};

const bindEntityRefInputResolver = <
  TRef extends AnyEntityRef,
  TResolver extends EntityRefInputResolver<TRef['entityName'], unknown> | undefined,
>(
  ref: TRef,
  resolver: TResolver,
) => {
  if (!resolver) {
    return ref;
  }

  let hasResolved = false;
  let resolved: unknown;

  Object.defineProperty(ref, 'resolve', {
    configurable: true,
    enumerable: false,
    value: () => {
      if (!hasResolved) {
        resolved = resolver(ref);
        hasResolved = true;
      }

      return resolved;
    },
  });

  return ref as TRef & {
    resolve: () => TResolver extends EntityRefInputResolver<TRef['entityName'], infer TResult>
      ? TResult
      : never;
  };
};

export const deriveEntityRefInputRefs = <TInputRefs extends EntityRefInputDeclarations>(
  input: object,
  inputRefs: TInputRefs | undefined,
): EntityRefInputDerivedRefs<TInputRefs> => {
  const inputRecord = input as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(inputRefs ?? {}).flatMap(([name, inputRef]) => {
      const directRef = readDirectInputRef(inputRecord, name, inputRef);
      const ref =
        directRef ??
        (() => {
          const locator = resolveEntityRefInputLocators(name, inputRef)
            .map(candidate => buildLocatorFromInput(inputRecord, candidate))
            .find(candidate => candidate !== undefined);

          return locator ? createEntityRef(inputRef.entityName, locator) : undefined;
        })();

      return ref ? [[name, bindEntityRefInputResolver(ref, inputRef.resolver)]] : [];
    }),
  ) as EntityRefInputDerivedRefs<TInputRefs>;
};

export const attachEntityRefInputRefs = <
  TInput extends object,
  TInputRefs extends EntityRefInputDeclarations,
>(
  input: TInput,
  inputRefs: TInputRefs | undefined,
): EntityRefInputRunInput<TInput, TInputRefs> => {
  const refs = deriveEntityRefInputRefs(input, inputRefs);
  const hasInputRefs = Object.keys(inputRefs ?? {}).length > 0;

  return !hasInputRefs
    ? (input as EntityRefInputRunInput<TInput, TInputRefs>)
    : ({
        ...input,
        refs,
      } as EntityRefInputRunInput<TInput, TInputRefs>);
};

export const createEntityRef = <
  TEntity extends Pick<AnyEntityDefinition, 'name'> | string,
  TLocator extends EntityRefLocator,
>(
  entityOrName: TEntity,
  locator: TLocator,
): EntityRef<EntityName<TEntity>, TLocator> => ({
  kind: 'entity-ref',
  entityName: resolveEntityName(entityOrName),
  locator,
});

export const getEntityIdentityLocator = (entityDefinition: AnyEntityDefinition) => {
  const identityLocatorName = entityDefinition.identityLocatorName;

  if (!identityLocatorName) {
    return undefined;
  }

  if (!(identityLocatorName in entityDefinition.refLocators)) {
    return undefined;
  }

  return {
    name: identityLocatorName,
    locator: entityDefinition.refLocators[identityLocatorName],
  };
};

export const createEntityIdentityRef = <
  TEntity extends AnyEntityDefinition,
  TSnapshot extends Record<string, unknown>,
>(
  entityDefinition: TEntity,
  snapshot: TSnapshot,
): EntityRef<TEntity['name'], EntityRefLocator> | undefined => {
  const identity = getEntityIdentityLocator(entityDefinition);

  if (!identity?.locator.fields || identity.locator.fields.length === 0) {
    return undefined;
  }

  const values = identity.locator.fields.map(fieldName => snapshot[fieldName]);

  if (values.some(value => !isEntityRefLocatorValue(value))) {
    return undefined;
  }

  return createEntityRef(
    entityDefinition,
    identity.locator(...(values as readonly EntityRefLocatorValue[])),
  );
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
    [relationName]: Object.fromEntries(
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
  }) as BoundEntityRefRelation<TRef, TRelationName, TOperations, TResult>;

export const isEntityRef = (value: unknown): value is AnyEntityRef =>
  isPlainObject(value) &&
  value.kind === 'entity-ref' &&
  typeof value.entityName === 'string' &&
  isPlainObject(value.locator);

export const normalizeEntityRef = (ref: AnyEntityRef): string =>
  `${ref.entityName}:${normalizeEntityRefLocatorValue(ref.locator)}`;

export const entityRefsEqual = (left: AnyEntityRef, right: AnyEntityRef): boolean =>
  normalizeEntityRef(left) === normalizeEntityRef(right);
