type Predicate =
  | {
      kind: 'predicate';
      operator: 'eq';
      fieldName: string;
      value: unknown;
    }
  | {
      kind: 'predicate';
      operator: 'in';
      fieldName: string;
      values: readonly unknown[];
    }
  | {
      kind: 'predicate';
      operator: 'isNull';
      fieldName: string;
    }
  | {
      kind: 'predicate';
      operator: 'lte';
      fieldName: string;
      value: unknown;
    }
  | {
      kind: 'predicate';
      operator: 'lt';
      fieldName: string;
      value: unknown;
    };

type OrderSpec = {
  kind: 'order';
  fieldName: string;
  direction: 'asc' | 'desc';
};

const comparePredicateValues = (left: unknown, right: unknown) => {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right));
};

export const applyPredicates = (
  rows: ReadonlyArray<Record<string, unknown>>,
  predicates: readonly Predicate[],
) =>
  rows.filter(row =>
    predicates.every(predicate => {
      if (predicate.operator === 'eq') {
        return row[predicate.fieldName] === predicate.value;
      }

      if (predicate.operator === 'in') {
        return predicate.values.includes(row[predicate.fieldName]);
      }

      if (predicate.operator === 'lte') {
        const rowValue = row[predicate.fieldName];
        return rowValue != null && comparePredicateValues(rowValue, predicate.value) <= 0;
      }

      if (predicate.operator === 'lt') {
        const rowValue = row[predicate.fieldName];
        return rowValue != null && comparePredicateValues(rowValue, predicate.value) < 0;
      }

      return row[predicate.fieldName] == null;
    }),
  );

export const applyOrder = (
  rows: ReadonlyArray<Record<string, unknown>>,
  orderBy: readonly OrderSpec[],
) => {
  if (orderBy.length === 0) {
    return [...rows];
  }

  return [...rows].sort((left, right) => {
    for (const order of orderBy) {
      const leftValue = left[order.fieldName];
      const rightValue = right[order.fieldName];

      if (leftValue === rightValue) {
        continue;
      }

      const comparison =
        leftValue == null ? -1 : rightValue == null ? 1 : leftValue < rightValue ? -1 : 1;

      return order.direction === 'asc' ? comparison : comparison * -1;
    }

    return 0;
  });
};
