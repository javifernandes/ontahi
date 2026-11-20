import type { GraphSchemaPresentation } from '../../value/schema/presentation.js';
import type { ModelExpressionDependency, ModelExpressionProgram } from '../expression/program.js';

export type { GraphSchemaPresentation } from '../../value/schema/presentation.js';

export type DerivedFieldMetadata = {
  expression?: ModelExpressionProgram;
  dependencies?: readonly ModelExpressionDependency[];
};

export type StringFieldConstraints = {
  minLength?: number;
  maxLength?: number;
  trim?: true;
  exclude?: {
    values: readonly string[];
    caseInsensitive?: true;
  };
  pattern?: {
    source: string;
    flags?: string;
  };
  format?: 'email' | 'url' | 'uuid' | 'datetime';
  messages?: {
    required?: string;
    minLength?: string;
    maxLength?: string;
    exclude?: string;
    pattern?: string;
    format?: string;
  };
};

export type NumberFieldConstraints = {
  coerce?: true;
  integer?: true;
  min?: number;
  max?: number;
  multipleOf?: number;
  messages?: {
    required?: string;
    integer?: string;
    min?: string;
    max?: string;
    multipleOf?: string;
  };
};

export type FieldDefinition<TValue> = {
  kind: 'field';
  fieldType: 'id' | 'string' | 'number' | 'boolean' | 'date' | 'json' | 'enum' | 'reference';
  valueType?: string;
  enumValues?: readonly string[];
  stringConstraints?: StringFieldConstraints;
  numberConstraints?: NumberFieldConstraints;
  nullable?: true;
  optional?: true;
  description?: string;
  presentation?: GraphSchemaPresentation;
  defaultValue?: TValue;
  generatedBy?: string;
  derived?: DerivedFieldMetadata;
  __value?: TValue;
};

export type FieldDefinitions = Record<string, FieldDefinition<unknown>>;
export type AnyFieldDefinition = FieldDefinition<unknown>;

export type DefaultedFieldDefinition<TField extends AnyFieldDefinition> = Omit<
  TField,
  'defaultValue' | 'optional' | '__value'
> & {
  defaultValue: InferFieldValue<TField>;
  optional?: never;
  __value?: InferFieldValue<TField>;
};

export type GeneratedFieldDefinition<TField extends AnyFieldDefinition> = Omit<
  TField,
  'generatedBy' | 'optional' | '__value'
> & {
  generatedBy: string;
  optional?: never;
  __value?: InferFieldValue<TField>;
};

export type DerivedFieldDefinition<TValue> = FieldDefinition<TValue> & {
  derived: DerivedFieldMetadata;
};

export type IdFieldDefinition = FieldDefinition<string> & {
  fieldType: 'id';
  nullable?: never;
  optional?: never;
};

export const isDerivedFieldDefinition = (
  definition: AnyFieldDefinition,
): definition is DerivedFieldDefinition<unknown> => definition.derived !== undefined;

export type InferFieldValue<TField extends AnyFieldDefinition> = TField extends {
  __value?: infer TValue;
}
  ? TValue
  : never;

export type InferEntityRecord<TFields extends FieldDefinitions> = {
  [TKey in keyof TFields]: InferFieldValue<TFields[TKey]>;
};

export type StoredFieldName<TFields extends FieldDefinitions> = {
  [TKey in keyof TFields]: TFields[TKey] extends { derived: DerivedFieldMetadata } ? never : TKey;
}[keyof TFields];

export type WritableStoredFieldName<TFields extends FieldDefinitions> = {
  [TKey in StoredFieldName<TFields>]: TFields[TKey] extends { generatedBy: string } ? never : TKey;
}[StoredFieldName<TFields>];

type OptionalStoredFieldName<TFields extends FieldDefinitions> = {
  [TKey in WritableStoredFieldName<TFields>]: TFields[TKey] extends
    | { optional: true }
    | { defaultValue: unknown }
    ? TKey
    : never;
}[WritableStoredFieldName<TFields>];

type RequiredStoredFieldName<TFields extends FieldDefinitions> = Exclude<
  WritableStoredFieldName<TFields>,
  OptionalStoredFieldName<TFields>
>;

type SimplifyFields<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & {};

export type InferEntityMutationRecord<TFields extends FieldDefinitions> = SimplifyFields<
  {
    [TKey in RequiredStoredFieldName<TFields>]: InferFieldValue<TFields[TKey]>;
  } & {
    [TKey in OptionalStoredFieldName<TFields>]?: Exclude<InferFieldValue<TFields[TKey]>, undefined>;
  }
>;
