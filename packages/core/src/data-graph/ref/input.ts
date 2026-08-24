import type { AnyEntityDefinition, InferEntityRecord } from '../definitions.js';
import type { SemanticSelection } from '../selection-ast.js';

import {
  resolveEntityRefName,
  type EntityName,
  type EntityRef,
  type EntityRefLocator,
  type EntityRefLocatorDeclarations,
  type EntityRefLocatorFactory,
  type SchemaEntityRef,
} from './model.js';

type SingleLocatorArgument<TLocator> = TLocator extends (...args: infer TArguments) => unknown
  ? TArguments extends [infer TValue]
    ? TValue
    : never
  : never;

type IsUnion<TValue, TWhole = TValue> = TValue extends unknown
  ? [TWhole] extends [TValue]
    ? false
    : true
  : never;

type IdentityScalar<TEntity extends AnyEntityDefinition> =
  IsUnion<keyof TEntity['refLocators']> extends true
    ? never
    : SingleLocatorArgument<TEntity['refLocators'][keyof TEntity['refLocators']]>;

type IdentityLocator<TEntity extends AnyEntityDefinition> =
  TEntity['identityLocatorName'] extends keyof TEntity['refLocators']
    ? TEntity['refLocators'][TEntity['identityLocatorName']]
    : never;

type IdentityFieldNames<TEntity extends AnyEntityDefinition> =
  IdentityLocator<TEntity> extends { fields: readonly (infer TFieldName extends string)[] }
    ? TFieldName
    : never;

type IdentityRecord<TEntity extends AnyEntityDefinition> = [IdentityFieldNames<TEntity>] extends [
  never,
]
  ? never
  : Pick<
      InferEntityRecord<TEntity['fields']>,
      Extract<IdentityFieldNames<TEntity>, keyof InferEntityRecord<TEntity['fields']>>
    >;

export type EntitySelectionInputItem<TEntity extends AnyEntityDefinition> =
  | EntityRef<TEntity['name']>
  | InferEntityRecord<TEntity['fields']>
  | IdentityRecord<TEntity>
  | IdentityScalar<TEntity>;

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

export type SemanticSelectionPublicInput<TInput> =
  TInput extends SchemaEntityRef<infer TEntityName, infer TLocator, any, any>
    ? EntityRef<TEntityName, TLocator>
    : TInput extends SemanticSelection<infer TEntityName, infer TEntity>
      ? TEntity extends AnyEntityDefinition
        ? TInput | EntitySelectionInputItem<TEntity> | readonly EntitySelectionInputItem<TEntity>[]
        : TInput | EntityRef<TEntityName>
      : TInput extends Date
        ? TInput
        : TInput extends readonly (infer TItem)[]
          ? readonly SemanticSelectionPublicInput<TItem>[]
          : TInput extends object
            ? { [TKey in keyof TInput]: SemanticSelectionPublicInput<TInput[TKey]> }
            : TInput;

export type EntityRefInputPublicInput<
  TInput,
  TInputRefs extends EntityRefInputDeclarations,
> = keyof TInputRefs extends never
  ? SemanticSelectionPublicInput<TInput>
  : string extends keyof TInputRefs
    ? SemanticSelectionPublicInput<TInput> | (Partial<TInput> & Record<string, unknown>)
    :
        | SemanticSelectionPublicInput<TInput>
        | (Omit<SemanticSelectionPublicInput<TInput>, keyof TInputRefs> &
            EntityRefInputDirectRefs<TInputRefs>);

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
      entityName: resolveEntityRefName(entityOrName),
      isReceiver: false,
      isOptional: false,
      locators: [],
      inferredLocators: inferableEntityRefInputLocators(entityLocators),
    },
    entityLocators,
  );
};
