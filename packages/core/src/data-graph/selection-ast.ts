import type { AnyEntityRef, EntityRefLocatorValue } from './ref.js';

export type SelectionPredicate =
  | {
      readonly kind: 'predicate';
      readonly operator: 'eq';
      readonly fieldName: string;
      readonly value: unknown;
    }
  | {
      readonly kind: 'predicate';
      readonly operator: 'in';
      readonly fieldName: string;
      readonly values: readonly unknown[];
    }
  | {
      readonly kind: 'predicate';
      readonly operator: 'isNull';
      readonly fieldName: string;
    }
  | {
      readonly kind: 'predicate';
      readonly operator: 'lte';
      readonly fieldName: string;
      readonly value: unknown;
    }
  | {
      readonly kind: 'predicate';
      readonly operator: 'lt';
      readonly fieldName: string;
      readonly value: unknown;
    }
  | {
      readonly kind: 'predicate';
      readonly operator: 'gte';
      readonly fieldName: string;
      readonly value: unknown;
    }
  | {
      readonly kind: 'predicate';
      readonly operator: 'gt';
      readonly fieldName: string;
      readonly value: unknown;
    };

export type SelectionExpression =
  | SelectionPredicate
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }
  | { readonly kind: 'references'; readonly refs: readonly AnyEntityRef[] }
  | {
      readonly kind: 'and';
      readonly operands: readonly SelectionExpression[];
    }
  | {
      readonly kind: 'or';
      readonly operands: readonly SelectionExpression[];
    }
  | {
      readonly kind: 'not';
      readonly operand: SelectionExpression;
    };

export type SelectionAst<TEntityName extends string = string> = {
  readonly kind: 'selection';
  readonly entityName: TEntityName;
  readonly expression: SelectionExpression;
};

export type SelectionAstSource<TEntityName extends string = string> = {
  readonly root: { readonly name: TEntityName };
  readonly selection: SelectionExpression;
};

export type EntitySelectionSource<TEntity = { readonly name: string }> = {
  readonly root: TEntity;
  readonly expression: SelectionExpression;
  readonly cardinality?: 'one' | 'many';
};

export type SemanticSelection<
  TEntityName extends string = string,
  TEntity extends { readonly name: TEntityName } = { readonly name: TEntityName },
  TCardinality extends 'one' | 'many' | undefined = 'one' | 'many' | undefined,
> = EntitySelectionSource<TEntity> & {
  readonly name?: string;
  readonly __cardinality?: TCardinality;
  build(): SelectionExpression;
};

const copyPredicate = (predicate: SelectionPredicate): SelectionPredicate =>
  predicate.operator === 'in'
    ? {
        ...predicate,
        values: [...predicate.values],
      }
    : { ...predicate };

export const selectionAll = (): SelectionExpression => ({ kind: 'all' });

export const selectionNone = (): SelectionExpression => ({ kind: 'none' });

const copyLocatorValue = (value: EntityRefLocatorValue): EntityRefLocatorValue =>
  Array.isArray(value)
    ? value.map(copyLocatorValue)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value).map(([key, child]) => [key, copyLocatorValue(child)]),
        )
      : value;

export const selectionReferences = (refs: readonly AnyEntityRef[]): SelectionExpression => ({
  kind: 'references',
  refs: refs.map(ref => ({
    ...ref,
    locator: Object.fromEntries(
      Object.entries(ref.locator).map(([fieldName, value]) => [fieldName, copyLocatorValue(value)]),
    ),
  })),
});

export const selectionAnd = (...operands: readonly SelectionExpression[]): SelectionExpression => {
  const flattened = operands.flatMap(operand =>
    operand.kind === 'and' ? operand.operands : [operand],
  );

  if (flattened.some(operand => operand.kind === 'none')) {
    return selectionNone();
  }

  const effective = flattened.filter(operand => operand.kind !== 'all');
  return effective.length === 0
    ? selectionAll()
    : effective.length === 1
      ? effective[0]!
      : { kind: 'and', operands: effective };
};

export const selectionOr = (...operands: readonly SelectionExpression[]): SelectionExpression => {
  const flattened = operands.flatMap(operand =>
    operand.kind === 'or' ? operand.operands : [operand],
  );

  if (flattened.some(operand => operand.kind === 'all')) {
    return selectionAll();
  }

  const effective = flattened.filter(operand => operand.kind !== 'none');
  return effective.length === 0
    ? selectionNone()
    : effective.length === 1
      ? effective[0]!
      : { kind: 'or', operands: effective };
};

export const selectionNot = (operand: SelectionExpression): SelectionExpression => {
  if (operand.kind === 'all') {
    return selectionNone();
  }

  if (operand.kind === 'none') {
    return selectionAll();
  }

  return operand.kind === 'not' ? operand.operand : { kind: 'not', operand };
};

export const copySelectionExpression = (expression: SelectionExpression): SelectionExpression => {
  if (expression.kind === 'predicate') {
    return copyPredicate(expression);
  }

  if (expression.kind === 'and' || expression.kind === 'or') {
    return {
      kind: expression.kind,
      operands: expression.operands.map(copySelectionExpression),
    };
  }

  if (expression.kind === 'not') {
    return {
      kind: 'not',
      operand: copySelectionExpression(expression.operand),
    };
  }

  if (expression.kind === 'references') {
    return selectionReferences(expression.refs);
  }

  return { ...expression };
};

export const lowerSelectionReferences = (expression: SelectionExpression): SelectionExpression => {
  if (expression.kind === 'references') {
    return selectionOr(
      ...expression.refs.map(ref =>
        selectionAnd(
          ...Object.entries(ref.locator).map(([fieldName, value]) => ({
            kind: 'predicate' as const,
            operator: 'eq' as const,
            fieldName,
            value,
          })),
        ),
      ),
    );
  }

  if (expression.kind === 'and' || expression.kind === 'or') {
    const operands = expression.operands.map(lowerSelectionReferences);
    return expression.kind === 'and' ? selectionAnd(...operands) : selectionOr(...operands);
  }

  return expression.kind === 'not'
    ? selectionNot(lowerSelectionReferences(expression.operand))
    : copySelectionExpression(expression);
};

export const getConjunctiveSelectionPredicates = (
  expression: SelectionExpression,
): readonly SelectionPredicate[] | undefined => {
  if (expression.kind === 'all') {
    return [];
  }

  if (expression.kind === 'predicate') {
    return [expression];
  }

  if (expression.kind !== 'and') {
    return undefined;
  }

  const predicates = expression.operands.flatMap(operand => {
    const nested = getConjunctiveSelectionPredicates(operand);
    return nested ? [...nested] : [undefined];
  });

  return predicates.some(predicate => predicate === undefined)
    ? undefined
    : (predicates as SelectionPredicate[]);
};

/** Extracts the membership-only, runtime-independent part of a graph read or command target. */
export const toSelectionAst = <TEntityName extends string>(
  source: SelectionAstSource<TEntityName>,
): SelectionAst<TEntityName> => ({
  kind: 'selection',
  entityName: source.root.name,
  expression: copySelectionExpression(source.selection),
});
