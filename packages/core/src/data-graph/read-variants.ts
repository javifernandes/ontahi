import { isRecord } from '../value/object.js';

import type { AnyEntityDefinition } from './definitions.js';
import {
  getEntityVariantContract,
  type AnyEntityVariant,
  type EntityVariantDescriptor,
} from './entity-variant-contract.js';
import { selectionAnd, type SelectionAst, type SelectionExpression } from './selection-ast.js';

/** Normalize root names for ordinary validation, then impose receiver classifiers after grants. */
export const lowerReadVariantSelection = (
  selection: SelectionAst,
  variants: ReadonlyMap<string, EntityVariantDescriptor>,
  classify = false,
): SelectionAst => {
  const visit = (expression: SelectionExpression): SelectionExpression => {
    if (!isRecord(expression)) return expression;
    if (expression.kind === 'relation-image' && isRecord(expression.source))
      return {
        ...expression,
        source: lowerReadVariantSelection(expression.source, variants, classify),
      };
    if (
      (expression.kind === 'and' || expression.kind === 'or') &&
      Array.isArray(expression.operands)
    )
      return {
        ...expression,
        operands: expression.operands.map(visit),
      };
    if (expression.kind === 'not') return { ...expression, operand: visit(expression.operand) };
    return expression;
  };
  const variant = variants.get(selection.entityName);
  const expression = visit(selection.expression);
  return {
    ...selection,
    entityName: variant?.baseEntityName ?? selection.entityName,
    expression:
      variant && classify
        ? selectionAnd(expression, {
            kind: 'predicate',
            fieldName: variant.discriminator.fieldName,
            operator: 'eq',
            value: variant.discriminator.value,
          })
        : expression,
  };
};

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
