import { hasOwn } from '../../value/object.js';
import type { ReferenceFieldDefinition } from '../definitions.js';

import { getEntityIdentityLocator } from './identity.js';
import { isEntityRef } from './model.js';

/** Classified participants accept canonical base identities, not alternate lookup criteria. */
export const variantReferenceInputError = (
  reference: ReferenceFieldDefinition,
  value: unknown,
): string | undefined => {
  if (!reference.variant) return undefined;
  const fields = getEntityIdentityLocator(reference.target)?.locator.fields;
  if (
    !fields?.length ||
    !isEntityRef(value) ||
    value.entityName !== reference.target.name ||
    Object.keys(value.locator).length !== fields.length ||
    fields.some(field => !hasOwn(value.locator, field))
  )
    return `Referenced ${reference.variant.name} requires the canonical identity of ${reference.target.name} (${fields?.join(', ') ?? 'not declared'}).`;
  return undefined;
};
