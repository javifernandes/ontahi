import type { AnyEntityDefinition } from '../definitions.js';

import {
  createEntityRef,
  isEntityRefLocatorValue,
  type EntityRef,
  type EntityRefLocator,
  type EntityRefLocatorValue,
} from './model.js';

export const getEntityIdentityLocator = (entityDefinition: AnyEntityDefinition) => {
  const identityLocatorName = entityDefinition.identityLocatorName;

  if (!identityLocatorName) {
    return undefined;
  }

  if (!(identityLocatorName in entityDefinition.refLocators)) {
    return undefined;
  }

  return {
    name: identityLocatorName,
    locator: entityDefinition.refLocators[identityLocatorName],
  };
};

export const createEntityIdentityRef = <
  TEntity extends AnyEntityDefinition,
  TSnapshot extends Record<string, unknown>,
>(
  entityDefinition: TEntity,
  snapshot: TSnapshot,
): EntityRef<TEntity['name'], EntityRefLocator> | undefined => {
  const identity = getEntityIdentityLocator(entityDefinition);

  if (!identity?.locator.fields || identity.locator.fields.length === 0) {
    return undefined;
  }

  const values = identity.locator.fields.map(fieldName => snapshot[fieldName]);

  if (values.some(value => !isEntityRefLocatorValue(value))) {
    return undefined;
  }

  return createEntityRef(
    entityDefinition,
    identity.locator(...(values as readonly EntityRefLocatorValue[])),
  );
};
