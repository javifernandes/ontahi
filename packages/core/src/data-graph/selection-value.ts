import { GraphCommand } from './command.js';
import type { AnyEntityDefinition, InferEntityRecord } from './definitions.js';
import { query, type EntityFieldProxy, type QueryBuilder } from './query.js';
import type { AnyEntityRef, EntityRef } from './ref.js';
import {
  copySelectionExpression,
  selectionAll,
  selectionAnd,
  selectionNone,
  selectionNot,
  selectionOr,
  selectionReferences,
  toSelectionAst,
  type EntitySelectionSource,
  type SelectionAst,
  type SelectionExpression,
} from './selection-ast.js';
import {
  GraphSelection,
  createDeleteCommandSpec,
  createUpdateCommandSpec,
  type EntityFieldName,
  type PickEntityFields,
  type QueryIncludeArg,
  type QueryOrderByArg,
  type QuerySelectArg,
  type QueryWhereArg,
} from './selection.js';
import type { RecursiveEntityViewDefinition } from './view.js';

const ONTAHI_SELECTION = Symbol.for('@ontahi/core/data-graph/selection');

export type SelectionBuilder<TEntity extends AnyEntityDefinition> = (
  root: EntityFieldProxy<TEntity>,
) => SelectionExpression;

export type EntitySelectionFactory<TEntity extends AnyEntityDefinition> = {
  selection: (build: SelectionBuilder<TEntity>) => Selection<TEntity>;
};

type SelectionCardinality = 'one' | 'many' | undefined;

type SelectionOperand<TEntity extends AnyEntityDefinition> =
  | Selection<TEntity>
  | SelectionBuilder<TEntity>;

type SelectionReturningResult<
  TEntity extends AnyEntityDefinition,
  TFieldNames extends readonly EntityFieldName<TEntity>[],
  TCardinality extends SelectionCardinality,
> = TCardinality extends 'one'
  ? PickEntityFields<TEntity, TFieldNames>
  : Array<PickEntityFields<TEntity, TFieldNames>>;

const expressionFromBuilder = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  build: SelectionBuilder<TEntity>,
) => query(root).where(build).build().selection;

export class Selection<
  TEntity extends AnyEntityDefinition,
  TCardinality extends SelectionCardinality = SelectionCardinality,
> implements EntitySelectionSource<TEntity> {
  constructor(
    readonly root: TEntity,
    readonly expression: SelectionExpression,
    readonly name?: string,
    readonly cardinality?: TCardinality,
  ) {
    Object.defineProperty(this, ONTAHI_SELECTION, { value: true });
  }

  static all<TEntity extends AnyEntityDefinition>(root: TEntity) {
    return new Selection(root, selectionAll());
  }

  static none<TEntity extends AnyEntityDefinition>(root: TEntity) {
    return new Selection(root, selectionNone());
  }

  static where<TEntity extends AnyEntityDefinition>(
    root: TEntity,
    build: SelectionBuilder<TEntity>,
  ) {
    return new Selection(root, expressionFromBuilder(root, build));
  }

  static references<
    TEntity extends AnyEntityDefinition,
    TCardinality extends SelectionCardinality = undefined,
  >(root: TEntity, refs: readonly EntityRef<TEntity['name']>[], cardinality?: TCardinality) {
    const mismatchedRef = refs.find(ref => ref.entityName !== root.name);
    if (mismatchedRef) {
      throw new Error(`Cannot select ${root.name} using a ${mismatchedRef.entityName} reference.`);
    }
    return new Selection(
      root,
      selectionReferences(refs as readonly AnyEntityRef[]),
      undefined,
      cardinality,
    );
  }

  and(operand: SelectionOperand<TEntity>) {
    return new Selection(
      this.root,
      selectionAnd(this.expression, this.resolveOperand(operand)),
      this.name,
      this.cardinality,
    );
  }

  or(operand: SelectionOperand<TEntity>) {
    return new Selection(
      this.root,
      selectionOr(this.expression, this.resolveOperand(operand)),
      this.name,
      this.cardinality,
    );
  }

  not() {
    return new Selection(this.root, selectionNot(this.expression), this.name, this.cardinality);
  }

  named(name: string) {
    if (name.trim().length === 0) {
      throw new Error('Selection name cannot be empty.');
    }
    return new Selection(this.root, this.expression, name, this.cardinality);
  }

  toQuery(): QueryBuilder<TEntity> {
    return query(this.root).where(this);
  }

  where(build: QueryWhereArg<TEntity, InferEntityRecord<TEntity['fields']>>) {
    return this.toGraphSelection().where(build);
  }

  select(build: QuerySelectArg<TEntity, InferEntityRecord<TEntity['fields']>>) {
    return this.toGraphSelection().select(build);
  }

  include(build: QueryIncludeArg<TEntity, InferEntityRecord<TEntity['fields']>>) {
    return this.toGraphSelection().include(build);
  }

  as<TView extends RecursiveEntityViewDefinition<TEntity, any, any>>(view: TView) {
    return this.toGraphSelection().as(view);
  }

  orderBy(build: QueryOrderByArg<TEntity, InferEntityRecord<TEntity['fields']>>) {
    return this.toGraphSelection().orderBy(build);
  }

  limit(limitValue: number) {
    return this.toGraphSelection().limit(limitValue);
  }

  update(payload: Partial<InferEntityRecord<TEntity['fields']>>) {
    return new GraphCommand(
      createUpdateCommandSpec(this.root, this, payload, {
        ...(this.cardinality ? { cardinality: this.cardinality } : {}),
      }),
    );
  }

  updateReturning<TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    payload: Partial<InferEntityRecord<TEntity['fields']>>,
    fieldNames: TFieldNames,
  ): GraphCommand<
    TEntity,
    Partial<InferEntityRecord<TEntity['fields']>>,
    SelectionReturningResult<TEntity, TFieldNames, TCardinality>
  > {
    return new GraphCommand(
      createUpdateCommandSpec(this.root, this, payload, {
        returning: fieldNames,
        ...(this.cardinality ? { cardinality: this.cardinality } : {}),
      }),
    ) as GraphCommand<
      TEntity,
      Partial<InferEntityRecord<TEntity['fields']>>,
      SelectionReturningResult<TEntity, TFieldNames, TCardinality>
    >;
  }

  delete() {
    return new GraphCommand(
      createDeleteCommandSpec(this.root, this, {
        ...(this.cardinality ? { cardinality: this.cardinality } : {}),
      }),
    );
  }

  deleteReturning<TFieldNames extends readonly EntityFieldName<TEntity>[]>(
    fieldNames: TFieldNames,
  ): GraphCommand<TEntity, never, SelectionReturningResult<TEntity, TFieldNames, TCardinality>> {
    return new GraphCommand(
      createDeleteCommandSpec(this.root, this, {
        returning: fieldNames,
        ...(this.cardinality ? { cardinality: this.cardinality } : {}),
      }),
    );
  }

  toAst(): SelectionAst<TEntity['name']> {
    return toSelectionAst({ root: this.root, selection: this.expression });
  }

  toJSON(): SelectionAst<TEntity['name']> {
    return this.toAst();
  }

  build(): SelectionExpression {
    return copySelectionExpression(this.expression);
  }

  pipe<TValue>(fn: (selection: this) => TValue): TValue {
    return fn(this);
  }

  private toGraphSelection() {
    return new GraphSelection(this.toQuery());
  }

  private resolveOperand(operand: SelectionOperand<TEntity>) {
    if (typeof operand === 'function') {
      return expressionFromBuilder(this.root, operand);
    }
    if (operand.root !== this.root) {
      throw new Error(`Cannot combine a ${this.root.name} selection with ${operand.root.name}.`);
    }
    return operand.expression;
  }
}

export const isSelection = (value: unknown): value is Selection<AnyEntityDefinition> =>
  value instanceof Selection ||
  (typeof value === 'object' &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[ONTAHI_SELECTION] === true &&
    typeof (value as { toAst?: unknown }).toAst === 'function' &&
    typeof (value as { build?: unknown }).build === 'function');

export const selection = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  build: SelectionBuilder<TEntity>,
) => Selection.where(root, build);
