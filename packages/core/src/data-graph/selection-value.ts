import type { AnyEntityDefinition } from './definitions.js';
import { query, type EntityProxy, type QueryBuilder } from './query.js';
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

export type SelectionBuilder<TEntity extends AnyEntityDefinition> = (
  root: EntityProxy<TEntity>,
) => SelectionExpression;

type SelectionOperand<TEntity extends AnyEntityDefinition> =
  | Selection<TEntity>
  | SelectionBuilder<TEntity>;

const expressionFromBuilder = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  build: SelectionBuilder<TEntity>,
) => query(root).where(build).build().selection;

export class Selection<
  TEntity extends AnyEntityDefinition,
> implements EntitySelectionSource<TEntity> {
  constructor(
    readonly root: TEntity,
    readonly expression: SelectionExpression,
    readonly name?: string,
    readonly cardinality?: 'one' | 'many',
  ) {}

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

  static references<TEntity extends AnyEntityDefinition>(
    root: TEntity,
    refs: readonly EntityRef<TEntity['name']>[],
  ) {
    const mismatchedRef = refs.find(ref => ref.entityName !== root.name);
    if (mismatchedRef) {
      throw new Error(`Cannot select ${root.name} using a ${mismatchedRef.entityName} reference.`);
    }
    return new Selection(root, selectionReferences(refs as readonly AnyEntityRef[]));
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

export const selection = <TEntity extends AnyEntityDefinition>(
  root: TEntity,
  build: SelectionBuilder<TEntity>,
) => Selection.where(root, build);
