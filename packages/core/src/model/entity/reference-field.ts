import type { AnyEntityDefinition } from './definition.js';
import type { AnyFieldDefinition, FieldDefinition } from './field.js';
import type { EntityRef } from './ref/model.js';
import type { EntityVariantDescriptor } from './variant-contract.js';

export type DeferredEntityReference<TEntity extends AnyEntityDefinition> = {
  readonly kind: 'ontahi.entity-ref';
  readonly __entity?: TEntity;
};

export type ReferenceFieldDefinition<TTarget extends AnyEntityDefinition = AnyEntityDefinition> =
  FieldDefinition<EntityRef<TTarget['name']>> & {
    fieldType: 'reference';
    target: TTarget;
    source?: AnyEntityDefinition;
    fieldName?: string;
    referenceRequirement?: 'portable' | 'existing';
    mutationRequirement?: 'existing';
    /** Receiver-owned classification requirement; portable Refs retain the base entityName. */
    variant?: EntityVariantDescriptor;
  };

export type AnyReferenceFieldDefinition = ReferenceFieldDefinition<AnyEntityDefinition>;

export const isReferenceFieldDefinition = (
  definition: AnyFieldDefinition,
): definition is AnyReferenceFieldDefinition => definition.fieldType === 'reference';
