import type { AnyEntityDefinition } from './definitions.js';
import {
  getEntityVariantContract,
  type AnyEntityVariant,
  type EntityVariantDescriptor,
} from './entity-variant-contract.js';

/** Receiver-owned registrations; client predicates and descriptors are never membership proof. */
export const createReadVariantRegistry = (
  policies: readonly { entity: AnyEntityDefinition; variants?: readonly AnyEntityVariant[] }[],
) => {
  const variants = new Map<string, EntityVariantDescriptor>();
  const entityNames = new Set(policies.map(policy => policy.entity.name));
  for (const policy of policies) {
    for (const variant of policy.variants ?? []) {
      const contract = getEntityVariantContract(variant);
      if (!contract || contract.base !== policy.entity)
        throw new Error(`Read variants must be declared on policy Entity ${policy.entity.name}.`);
      const descriptor = contract.descriptor;
      if (entityNames.has(descriptor.name) || variants.has(descriptor.name))
        throw new Error(`Duplicate Graph Read target ${descriptor.name}.`);
      variants.set(descriptor.name, descriptor);
    }
  }
  return variants;
};

export const readVariantCapabilities = (
  registry: ReadonlyMap<string, EntityVariantDescriptor>,
  entityName: string,
) => {
  const variants = [...registry.values()].filter(variant => variant.baseEntityName === entityName);
  return variants.length ? { variants: structuredClone(variants) } : {};
};
