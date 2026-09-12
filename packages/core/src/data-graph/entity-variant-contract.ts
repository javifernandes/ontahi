import type { AnyEntityDefinition } from './definitions.js';

export type EntityVariantDescriptor = {
  kind: 'entity-variant';
  name: string;
  baseEntityName: string;
  discriminator: { fieldName: string; value: string };
};

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
