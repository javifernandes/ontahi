import {
  isReferenceFieldDefinition,
  reflectSelectionFactories,
  reflectContextualSelections,
  type AnyEntityDefinition,
} from '@ontahi/core/data-graph';

import type { SelectionLanguageEntityReflection } from '../model/contracts.js';

export const reflectSelectionLanguageEntity = <TEntity extends AnyEntityDefinition>(
  entity: TEntity,
): SelectionLanguageEntityReflection<TEntity['name']> => ({
  name: entity.name,
  ...(reflectContextualSelections(entity)
    ? { contextualSelections: reflectContextualSelections(entity) }
    : {}),
  ...(reflectSelectionFactories(entity)
    ? { selectionFactories: reflectSelectionFactories(entity) }
    : {}),
  fields: Object.entries(entity.fields).map(([name, definition]) => {
    const reference = isReferenceFieldDefinition(definition)
      ? (() => {
          const target = definition.target;
          const identityName = target.identityLocatorName;
          const identity = identityName ? target.refLocators[identityName] : undefined;
          const identityFields = identity?.fields;
          return {
            entityName: target.name,
            ...(identityName && identityFields
              ? { identity: { name: identityName, fields: identityFields } }
              : {}),
          };
        })()
      : undefined;
    return {
      name,
      type: definition.fieldType,
      nullable: definition.nullable === true,
      ...(definition.valueType ? { valueType: definition.valueType } : {}),
      ...(definition.enumValues ? { enumValues: definition.enumValues } : {}),
      ...(reference ? { reference } : {}),
      ...(definition.description ? { documentation: definition.description } : {}),
    };
  }),
  relations: Object.keys(entity.relations).map(name => ({ name })),
});
