export {
  createEntityRef,
  entityRefsEqual,
  isEntityRef,
  isEntityRefLocatorValue,
  normalizeEntityRef,
} from './model.js';
export type {
  AnyEntityRef,
  EntityRef,
  EntityRefLocator,
  EntityRefLocatorDeclarations,
  EntityRefLocatorFactory,
  EntityRefLocatorValue,
  SchemaEntityRef,
} from './model.js';

export {
  getGraphSchemaReferenceResolver,
  graphSchemaExistingReference,
  graphSchemaReference,
} from './schema-reference.js';
export type {
  GraphSchemaReferenceDefinition,
  GraphSchemaReferenceRequirement,
  GraphSchemaReferenceResolver,
} from './schema-reference.js';

export { createEntityIdentityRef, getEntityIdentityLocator } from './identity.js';

export { defineEntityRefInput } from './input.js';
export {
  attachEntityRefInputRefs,
  bindEntityRefInputResolver,
  deriveEntityRefInputRefs,
  inferEntityRefInputLocatorFieldGroups,
  normalizeEntityRefInput,
  normalizeEntityRefQueryInput,
  readEntityRefQueryInputValue,
} from './input-normalization.js';
export type { EntityRefInputResolutionScope } from './input-normalization.js';
export type {
  EntityRefInputBuilder,
  EntityRefInputDeclaration,
  EntityRefInputDeclarations,
  EntityRefInputDerivedRefs,
  EntityRefInputDirectRefs,
  EntityRefInputLocator,
  EntityRefInputPublicInput,
  EntityRefInputResolver,
  EntityRefInputRunInput,
  EntitySelectionInputItem,
  SemanticSelectionPublicInput,
} from './input.js';

export {
  bindEntityRefMethods,
  bindEntityRefOperationProxy,
  bindEntityRefRelationOperations,
  createEntityRefFactory,
  getDefaultEntityRefOperationInput,
  pickEntityRefOperations,
} from './binding.js';
export type {
  BoundEntityRef,
  BoundEntityRefLocators,
  BoundEntityRefMethods,
  BoundEntityRefOperationProxy,
  BoundEntityRefRelation,
  BoundEntityRefRelationOperations,
  BoundEntityRefRelations,
  EntityRefMethodDeclarations,
} from './binding.js';
