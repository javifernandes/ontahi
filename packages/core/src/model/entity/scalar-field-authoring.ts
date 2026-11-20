import type {
  AnyFieldDefinition,
  FieldDefinition,
  IdFieldDefinition,
  NumberFieldConstraints,
  StringFieldConstraints,
} from './field.js';

const identifierStringConstraints = {
  minLength: 1,
  maxLength: 200,
} satisfies StringFieldConstraints;

export type StringFieldInputConstraints = Omit<StringFieldConstraints, 'pattern'> & {
  pattern?: RegExp | StringFieldConstraints['pattern'];
};

const normalizeStringConstraints = (
  constraints?: StringFieldInputConstraints,
): StringFieldConstraints | undefined => {
  if (!constraints) return undefined;

  const { pattern, ...rest } = constraints;
  return {
    ...rest,
    ...(pattern instanceof RegExp
      ? { pattern: { source: pattern.source, ...(pattern.flags ? { flags: pattern.flags } : {}) } }
      : pattern
        ? { pattern }
        : {}),
  };
};

export const scalarField = {
  named: <const TName extends string, TDefinition extends AnyFieldDefinition>(
    name: TName,
    definition: TDefinition,
  ): TDefinition & { valueType: TName } => {
    const valueType = name.trim();
    if (!valueType) throw new TypeError('Named Field value types require a non-empty name.');
    if (valueType !== name)
      throw new TypeError('Named Field value types cannot have surrounding whitespace.');
    if (definition.fieldType === 'reference')
      throw new TypeError('Named Field value types must wrap a scalar Field definition.');
    return { ...definition, valueType } as TDefinition & { valueType: TName };
  },
  id: (): IdFieldDefinition => ({
    kind: 'field',
    fieldType: 'id',
    stringConstraints: identifierStringConstraints,
  }),
  slug: (): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: identifierStringConstraints,
  }),
  string: (constraints?: StringFieldInputConstraints): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    ...(constraints ? { stringConstraints: normalizeStringConstraints(constraints) } : {}),
  }),
  nonEmptyString: (
    constraints?: Omit<StringFieldInputConstraints, 'minLength'>,
  ): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: normalizeStringConstraints({ minLength: 1, ...constraints }),
  }),
  email: (constraints?: Omit<StringFieldInputConstraints, 'format'>): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: normalizeStringConstraints({ ...constraints, format: 'email' }),
  }),
  url: (constraints?: Omit<StringFieldInputConstraints, 'format'>): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: normalizeStringConstraints({ ...constraints, format: 'url' }),
  }),
  uuid: (constraints?: Omit<StringFieldInputConstraints, 'format'>): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: normalizeStringConstraints({ ...constraints, format: 'uuid' }),
  }),
  datetime: (
    constraints?: Omit<StringFieldInputConstraints, 'format'>,
  ): FieldDefinition<string> => ({
    kind: 'field',
    fieldType: 'string',
    stringConstraints: normalizeStringConstraints({ ...constraints, format: 'datetime' }),
  }),
  number: (constraints?: NumberFieldConstraints): FieldDefinition<number> => ({
    kind: 'field',
    fieldType: 'number',
    ...(constraints ? { numberConstraints: constraints } : {}),
  }),
  integer: (constraints?: Omit<NumberFieldConstraints, 'integer'>): FieldDefinition<number> => ({
    kind: 'field',
    fieldType: 'number',
    numberConstraints: { integer: true, ...constraints },
  }),
  nonNegativeInteger: (): FieldDefinition<number> => ({
    kind: 'field',
    fieldType: 'number',
    numberConstraints: { integer: true, min: 0 },
  }),
  positiveInteger: (
    constraints?: Omit<NumberFieldConstraints, 'integer' | 'min'>,
  ): FieldDefinition<number> => ({
    kind: 'field',
    fieldType: 'number',
    numberConstraints: { integer: true, min: 1, ...constraints },
  }),
  boolean: (): FieldDefinition<boolean> => ({ kind: 'field', fieldType: 'boolean' }),
  date: (): FieldDefinition<Date> => ({ kind: 'field', fieldType: 'date' }),
  json: <TValue = unknown>(): FieldDefinition<TValue> => ({ kind: 'field', fieldType: 'json' }),
  enum: <const TValue extends readonly string[]>(
    values: TValue,
  ): FieldDefinition<TValue[number]> => ({ kind: 'field', fieldType: 'enum', enumValues: values }),
};
