import type { FieldDefinitions, IdFieldDefinition, InferFieldValue } from './field.js';
import type {
  EntityRefLocator,
  EntityRefLocatorFactory,
  EntityRefLocatorValue,
} from './ref/model.js';

export type EntityLocatorDeclaration<TFields extends FieldDefinitions = FieldDefinitions> =
  | (keyof TFields & string)
  | readonly (keyof TFields & string)[]
  | EntityRefLocatorFactory;

export type EntityLocatorDeclarations<TFields extends FieldDefinitions = FieldDefinitions> = Record<
  string,
  EntityLocatorDeclaration<TFields>
>;

export type ConventionalEntityLocatorDeclarations<TFields extends FieldDefinitions> =
  TFields extends { readonly id: IdFieldDefinition } ? { readonly refById: 'id' } : {};

export type EffectiveEntityLocatorDeclarations<
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
> = Omit<ConventionalEntityLocatorDeclarations<TFields>, keyof TLocators> & TLocators;

type FieldLocatorFactory<
  TFields extends FieldDefinitions,
  TField extends keyof TFields & string,
> = ((
  value: Extract<InferFieldValue<TFields[TField]>, EntityRefLocatorValue>,
) => EntityRefLocator) & { fields: readonly [TField] };

type CompositeFieldLocatorFactory<
  TFields extends FieldDefinitions,
  TFieldNames extends readonly (keyof TFields & string)[],
> = ((
  ...values: {
    [TIndex in keyof TFieldNames]: TFieldNames[TIndex] extends keyof TFields
      ? Extract<InferFieldValue<TFields[TFieldNames[TIndex]]>, EntityRefLocatorValue>
      : never;
  }
) => EntityRefLocator) & { fields: TFieldNames };

export type EntityRefLocatorFactories<
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
> = {
  [TName in keyof TLocators]: TLocators[TName] extends keyof TFields & string
    ? FieldLocatorFactory<TFields, TLocators[TName]>
    : TLocators[TName] extends readonly (keyof TFields & string)[]
      ? CompositeFieldLocatorFactory<TFields, TLocators[TName]>
      : TLocators[TName] extends EntityRefLocatorFactory
        ? TLocators[TName]
        : EntityRefLocatorFactory;
};

export const normalizeEntityLocatorDeclaration = <TFields extends FieldDefinitions>(
  declaration: EntityLocatorDeclaration<TFields>,
): EntityRefLocatorFactory => {
  if (typeof declaration === 'function') {
    return declaration;
  }

  if (Array.isArray(declaration)) {
    return Object.assign(
      (...values: readonly EntityRefLocatorValue[]): EntityRefLocator =>
        Object.fromEntries(declaration.map((fieldName, index) => [fieldName, values[index]])),
      {
        fields: declaration,
      },
    );
  }

  return Object.assign(
    (value: EntityRefLocatorValue): EntityRefLocator => ({
      [declaration as string]: value,
    }),
    {
      fields: [declaration as string],
    },
  );
};

export const normalizeEntityLocatorDeclarations = <
  TFields extends FieldDefinitions,
  TLocators extends EntityLocatorDeclarations<TFields>,
>(
  locators: TLocators,
): EntityRefLocatorFactories<TFields, TLocators> =>
  Object.fromEntries(
    Object.entries(locators).map(([name, declaration]) => [
      name,
      normalizeEntityLocatorDeclaration(declaration),
    ]),
  ) as EntityRefLocatorFactories<TFields, TLocators>;
