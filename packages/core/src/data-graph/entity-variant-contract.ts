import { isRecord } from '../value/object.js';

import type { AnyEntityDefinition } from './definitions.js';

export type EntityVariantDescriptor = {
  kind: 'entity-variant';
  name: string;
  baseEntityName: string;
  discriminator: { fieldName: string; value: string };
};

/** Erased variant declaration surface, without inventing a second Entity identity. */
export type AnyEntityVariant = {
  readonly kind: 'entity-variant';
  readonly name: string;
  readonly base: AnyEntityDefinition;
  readonly descriptor: EntityVariantDescriptor;
};

export const isEntityVariantDescriptor = (value: unknown): value is EntityVariantDescriptor =>
  isRecord(value) &&
  value.kind === 'entity-variant' &&
  typeof value.name === 'string' &&
  value.name.trim().length > 0 &&
  typeof value.baseEntityName === 'string' &&
  value.baseEntityName.trim().length > 0 &&
  value.name !== value.baseEntityName &&
  isRecord(value.discriminator) &&
  typeof value.discriminator.fieldName === 'string' &&
  value.discriminator.fieldName.length > 0 &&
  typeof value.discriminator.value === 'string';

const contracts = new WeakMap<
  object,
  { base: AnyEntityDefinition; descriptor: EntityVariantDescriptor }
>();

export const registerEntityVariantContract = (
  variant: object,
  base: AnyEntityDefinition,
  descriptor: EntityVariantDescriptor,
) => {
  contracts.set(variant, { base, descriptor: structuredClone(descriptor) });
};

export const getEntityVariantContract = (variant: object) => {
  const contract = contracts.get(variant);
  return contract
    ? { base: contract.base, descriptor: structuredClone(contract.descriptor) }
    : undefined;
};
