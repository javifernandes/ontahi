import { hasOwn } from '../value/object.js';

import type {
  AnyEntityDefinition,
  FieldDefinition,
  GraphSelectionDefinition,
  InferEntityRecord,
  InferFieldValue,
} from './definitions.js';
import { query, QueryBuilder } from './query.js';
import type { EntityRef } from './ref/index.js';
import { parseGraphSchema } from './schema.js';
import {
  copySelectionExpression,
  selectionAll,
  type SelectionExpression,
} from './selection-ast.js';
import { Selection, type SelectionBuilder } from './selection-value.js';

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

type FactoryInput<TEntity> = TEntity extends {
  selectionFactories: unknown;
  by: (input: infer TInput) => unknown;
}
  ? TInput
  : never;

/** Experimental local read surface. Schema inputs, discovery and writes are not yet supported. */
export class EntityVariant<
  TEntity extends AnyEntityDefinition,
  TName extends string,
  TDiscriminator extends EntityVariantDiscriminator<TEntity>,
> {
  readonly kind = 'entity-variant';
  readonly #membership: Selection<TEntity>;

  constructor(
    readonly base: TEntity,
    readonly name: TName,
    options: { discriminator: TDiscriminator },
  ) {
    if (!name.trim() || name === base.name)
      throw new TypeError('A variant needs a distinct, non-empty classification name.');
    const entries = Object.entries(options.discriminator);
    if (entries.length !== 1)
      throw new TypeError('A variant currently requires exactly one enum discriminator.');
    const [fieldName, value] = entries[0]!;
    const field = hasOwn(base.fields, fieldName) ? base.fields[fieldName] : undefined;
    if (
      !field ||
      field.fieldType !== 'enum' ||
      field.optional ||
      field.nullable ||
      field.derived ||
      typeof value !== 'string' ||
      !field.enumValues?.includes(value)
    )
      throw new TypeError('Variant discriminator must match a required stored enum field.');
    this.#membership = new Selection(base, { kind: 'predicate', fieldName, operator: 'eq', value });
  }

  all() {
    return new VariantSelection(this, selectionAll());
  }

  where(build: SelectionBuilder<VariantReadEntity<TEntity, TDiscriminator>>) {
    return this.all().where(build);
  }

  /** Reuse the base's declared pure factories; do not invent alternate locator semantics. */
  by(input: FactoryInput<TEntity>) {
    if (
      !('selectionFactories' in this.base) ||
      !('by' in this.base) ||
      typeof this.base.by !== 'function'
    )
      throw new TypeError(`No named Selection factories declared on ${this.base.name}.`);
    return this.from(this.base.by(input));
  }

  references(refs: readonly EntityRef<TEntity['name']>[]) {
    return this.from(Selection.references(this.base, refs));
  }

  /** Explicitly restrict existing base/contextual membership to this classification. */
  from(source: Selection<TEntity>) {
    if (!(source instanceof Selection) || source.root !== this.base)
      throw new TypeError(`Expected a ${this.base.name} Selection from this model definition.`);
    if (source.cardinality === 'one')
      throw new TypeError('Apply exact-one cardinality after narrowing to a variant.');
    return new VariantSelection(this, source.build());
  }

  /** @internal Lower only at the read boundary, never before complement or union composition. */
  constrain(expression: SelectionExpression) {
    return this.#membership.and(new Selection(this.base, copySelectionExpression(expression)));
  }

  toJSON(): never {
    throw new TypeError('Entity variant discovery and schema serialization are not supported yet.');
  }
}

export class VariantSelection<
  TEntity extends AnyEntityDefinition,
  TName extends string,
  TDiscriminator extends EntityVariantDiscriminator<TEntity>,
> {
  readonly #relative: Selection<TEntity>;

  constructor(
    readonly variant: EntityVariant<TEntity, TName, TDiscriminator>,
    expression: SelectionExpression,
  ) {
    this.#relative = new Selection(variant.base, copySelectionExpression(expression));
  }

  where(build: SelectionBuilder<VariantReadEntity<TEntity, TDiscriminator>>) {
    return this.and(build);
  }

  and(
    operand:
      | VariantSelection<TEntity, TName, TDiscriminator>
      | SelectionBuilder<VariantReadEntity<TEntity, TDiscriminator>>,
  ) {
    return new VariantSelection(this.variant, this.#relative.and(this.resolve(operand)).build());
  }

  or(
    operand:
      | VariantSelection<TEntity, TName, TDiscriminator>
      | SelectionBuilder<VariantReadEntity<TEntity, TDiscriminator>>,
  ) {
    return new VariantSelection(this.variant, this.#relative.or(this.resolve(operand)).build());
  }

  not() {
    return new VariantSelection(this.variant, this.#relative.not().build());
  }

  /** Explicit lowering to an ordinary base read; does not establish a remote variant contract. */
  toQuery() {
    // The physical root is exactly the base. The type projection is justified by mandatory
    // membership, not a cloned Entity with a different name, mapping, Ref or cache namespace.
    return new QueryBuilder<
      TEntity,
      InferEntityRecord<VariantReadEntity<TEntity, TDiscriminator>['fields']>
    >(query(this.variant.base).where(this.variant.constrain(this.#relative.build())).build());
  }

  many() {
    return this.toQuery();
  }
  one() {
    return this.toQuery().one();
  }
  first() {
    return this.toQuery().first();
  }
  count() {
    return this.toQuery().count();
  }
  exists() {
    return this.toQuery().exists();
  }

  orderBy(build: Parameters<ReturnType<this['toQuery']>['orderBy']>[0]) {
    return this.toQuery().orderBy(build);
  }

  limit(value: number) {
    return this.toQuery().limit(value);
  }

  toJSON(): never {
    throw new TypeError(
      'Variant Selection transport is not supported yet; explicitly lower with toQuery().',
    );
  }

  private resolve(
    operand:
      | VariantSelection<TEntity, TName, TDiscriminator>
      | SelectionBuilder<VariantReadEntity<TEntity, TDiscriminator>>,
  ) {
    if (typeof operand !== 'function') {
      if (!(operand instanceof VariantSelection) || operand.variant !== this.variant)
        throw new TypeError(
          'Variant composition requires the same classification; narrow explicitly with from().',
        );
      return operand.#relative;
    }
    // Both proxies expose the same field names; only discriminator value types are narrower.
    const expression = Selection.where(
      this.variant.base,
      operand as unknown as SelectionBuilder<TEntity>,
    ).build();
    // Validate caller-built data using the existing receiver-independent schema validator.
    const parsed = parseGraphSchema(
      {
        kind: 'schema.selection',
        entity: this.variant.base,
        cardinality: 'many',
      } as GraphSelectionDefinition<TEntity>,
      { kind: 'selection', entityName: this.variant.base.name, expression },
    );
    return new Selection(this.variant.base, parsed.expression);
  }
}
