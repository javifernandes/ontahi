import type { CompiledPredicate, CompiledSelectionExpression } from '@ontahi/core/data-graph';

const quotePostgrestValue = (value: unknown) => {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);

  const text = value instanceof Date ? value.toISOString() : String(value);
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
};

const serializeSupabasePredicate = (predicate: CompiledPredicate): SerializedSelection => {
  if (predicate.operator === 'isNull') return `${predicate.column}.is.null`;
  if (predicate.operator === 'in') {
    if (predicate.values.length === 0) return false;
    return `${predicate.column}.in.(${predicate.values.map(quotePostgrestValue).join(',')})`;
  }
  return `${predicate.column}.${predicate.operator}.${quotePostgrestValue(predicate.value)}`;
};

type SerializedSelection = string | boolean;

export const serializeSupabaseSelection = (
  selection: CompiledSelectionExpression,
): SerializedSelection => {
  if (!('kind' in selection)) return serializeSupabasePredicate(selection);
  if (selection.kind === 'all') return true;
  if (selection.kind === 'none') return false;
  if (selection.kind === 'not') {
    const operand = serializeSupabaseSelection(selection.operand);
    return typeof operand === 'boolean' ? !operand : `not.and(${operand})`;
  }
  if (selection.kind === 'and' || selection.kind === 'or') {
    const operands = selection.operands.map(serializeSupabaseSelection);
    const identity = selection.kind === 'and';
    if (operands.some(operand => operand === !identity)) return !identity;
    const filters = operands.filter((operand): operand is string => typeof operand === 'string');
    if (filters.length === 0) return identity;
    if (filters.length === 1) return filters[0]!;
    return `${selection.kind}(${filters.join(',')})`;
  }
  throw new Error('Unsupported compiled selection expression.');
};
