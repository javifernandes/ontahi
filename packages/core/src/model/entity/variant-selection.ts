import { hasOwn } from '../../value/object.js';
import { query, QueryBuilder } from '../query/query.js';
import {
  contextualSelectionProperties,
  type SelectionProperties,
} from '../query/selection/entity-selections.js';
import { Selection, type SelectionBuilder } from '../query/selection/selection.js';
import {
  assertSelectionExpressionFields,
  copySelectionExpression,
  selectionAll,
  type SelectionExpression,
} from '../query/selection-ast.js';

import type { AnyEntityDefinition } from './definition.js';
import type { InferEntityRecord } from './field.js';
import type { EntityRef } from './ref/model.js';
import {
  getEntityVariantContract,
  registerEntityVariantContract,
  type EntityVariantDescriptor,
} from './variant-contract.js';
import type { EntityVariantDiscriminator, VariantReadEntity } from './variant.js';

export { isEntityVariantDescriptor } from './variant-contract.js';
export type { EntityVariantDescriptor, AnyEntityVariant } from './variant-contract.js';
export type { EntityVariantDiscriminator, VariantReadEntity } from './variant.js';

type FactoryInput<TEntity> = TEntity extends {
  selectionFactories: unknown;
  by: (input: infer TInput) => unknown;
}
  ? TInput
  : never;

/** Experimental classified reads and existingRef inputs; writes are not yet supported. */
export class EntityVariant<
  TEntity extends AnyEntityDefinition,
  TName extends string,
  TDiscriminator extends EntityVariantDiscriminator<TEntity>,
> {
  readonly kind = 'entity-variant';
  declare readonly __discriminator: TDiscriminator;
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
      field?.fieldType !== 'enum' ||
      field.optional ||
      field.nullable ||
      field.derived ||
      typeof value !== 'string' ||
      !field.enumValues?.includes(value)
    )
      throw new TypeError('Variant discriminator must match a required stored enum field.');
    this.#membership = new Selection(base, { kind: 'predicate', fieldName, operator: 'eq', value });
    registerEntityVariantContract(this, base, {
      kind: 'entity-variant',
      name,
      baseEntityName: base.name,
      discriminator: { fieldName, value },
    });
  }

  get descriptor(): EntityVariantDescriptor {
    return getEntityVariantContract(this)!.descriptor;
  }

  all() {
    return createVariantSelection(this, selectionAll());
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
    return createVariantSelection(this, source.build());
  }

  /** @internal Lower only at the read boundary, never before complement or union composition. */
  constrain(expression: SelectionExpression) {
    return this.#membership.and(new Selection(this.base, copySelectionExpression(expression)));
  }

  toJSON(): never {
    throw new TypeError('Entity variant discovery and schema serialization are not supported yet.');
  }
}

const relativeSelections = new WeakMap<object, Selection<any>>();

const createVariantSelection = <
  TEntity extends AnyEntityDefinition,
  TName extends string,
  TDiscriminator extends EntityVariantDiscriminator<TEntity>,
>(
  variant: EntityVariant<TEntity, TName, TDiscriminator>,
  expression: SelectionExpression,
): VariantSelection<TEntity, TName, TDiscriminator> & SelectionProperties<TEntity> => {
  const selection = new VariantSelection(variant, expression);
  const relative = relativeSelections.get(selection)!;
  const projected = contextualSelectionProperties(selection, variant.base, () =>
    variant.constrain(relative.build()),
  );
  relativeSelections.set(projected, relative);
  return projected as VariantSelection<TEntity, TName, TDiscriminator> &
    SelectionProperties<TEntity>;
};

export class VariantSelection<
  TEntity extends AnyEntityDefinition,
  TName extends string,
  TDiscriminator extends EntityVariantDiscriminator<TEntity>,
> {
  private get relative(): Selection<TEntity> {
    return relativeSelections.get(this)!;
  }

  constructor(
    readonly variant: EntityVariant<TEntity, TName, TDiscriminator>,
    expression: SelectionExpression,
  ) {
    const relative = new Selection(variant.base, copySelectionExpression(expression));
    relativeSelections.set(this, relative);
  }

  where(build: SelectionBuilder<VariantReadEntity<TEntity, TDiscriminator>>) {
    return this.and(build);
  }

  and(
    operand:
      | VariantSelection<TEntity, TName, TDiscriminator>
      | SelectionBuilder<VariantReadEntity<TEntity, TDiscriminator>>,
  ) {
    return createVariantSelection(this.variant, this.relative.and(this.resolve(operand)).build());
  }

  or(
    operand:
      | VariantSelection<TEntity, TName, TDiscriminator>
      | SelectionBuilder<VariantReadEntity<TEntity, TDiscriminator>>,
  ) {
    return createVariantSelection(this.variant, this.relative.or(this.resolve(operand)).build());
  }

  not() {
    return createVariantSelection(this.variant, this.relative.not().build());
  }

  /** Explicit lowering to an ordinary base read; does not establish a remote variant contract. */
  toQuery() {
    // The physical root is exactly the base. The type projection is justified by mandatory
    // membership, not a cloned Entity with a different name, mapping, Ref or cache namespace.
    return new QueryBuilder<
      TEntity,
      InferEntityRecord<VariantReadEntity<TEntity, TDiscriminator>['fields']>
    >(query(this.variant.base).where(this.variant.constrain(this.relative.build())).build());
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
      return operand.relative;
    }
    // Both proxies expose the same field names; only discriminator value types are narrower.
    const expression = Selection.where(
      this.variant.base,
      operand as unknown as SelectionBuilder<TEntity>,
    ).build();
    assertSelectionExpressionFields(this.variant.base, expression);
    return new Selection(this.variant.base, expression);
  }
}
