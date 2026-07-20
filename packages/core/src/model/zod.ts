import { z } from 'zod';

export const nonEmptyString = z.string().min(1);

export const identifierSchema = nonEmptyString.max(200);

export const id = identifierSchema;
export const slug = identifierSchema;

export const integer = z.number().int();
export const nonNegativeInteger = integer.min(0);
export const positiveIntegerSchema = integer.min(1);
export const index = positiveIntegerSchema;

export const boundedPositiveInteger = (max: number) => positiveIntegerSchema.max(max);

export const nullable = <TSchema extends z.ZodTypeAny>(schema: TSchema) => schema.nullable();

export const optionalNullable = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema.nullable().optional();
