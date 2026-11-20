import type { AnyEntityDefinition } from './definition.js';
import type { FieldDefinition, InferFieldValue } from './field.js';
import type { EntityVariantDescriptor } from './variant-contract.js';

/** Only finite string-valued fields can describe the initial, fixed enum classification. */
export type EntityVariantDiscriminator<TEntity extends AnyEntityDefinition> = {
  [K in keyof TEntity['fields']]: InferFieldValue<TEntity['fields'][K]> extends string
    ? string extends InferFieldValue<TEntity['fields'][K]>
      ? never
      : { [P in K]: InferFieldValue<TEntity['fields'][K]> } & {
          [P in Exclude<keyof TEntity['fields'], K>]?: never;
        }
    : never;
}[keyof TEntity['fields']];

/** A type projection for reads, not another Entity object or identity namespace. */
export type VariantReadEntity<TEntity extends AnyEntityDefinition, TDiscriminator> = Omit<
  TEntity,
  'fields' | '__value'
> & {
  fields: {
    [K in keyof TEntity['fields']]: K extends keyof TDiscriminator
      ? FieldDefinition<TDiscriminator[K]>
      : TEntity['fields'][K];
  };
};

export type EntityVariantReferenceTarget<
  TEntity extends AnyEntityDefinition,
  TName extends string,
  TDiscriminator extends EntityVariantDiscriminator<TEntity>,
> = {
  readonly kind: 'entity-variant';
  readonly name: TName;
  readonly base: TEntity;
  readonly descriptor: EntityVariantDescriptor;
  /** @internal Type-only variant projection metadata; absent at runtime. */
  readonly __discriminator: TDiscriminator;
};
