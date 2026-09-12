import { isRecord } from '../value/object.js';

/** Bound recursive AST data before validation, JSON copying or hydration (including cycles). */
export const withinSelectionBudget = (expression: unknown): boolean => {
  const pending = [{ expression, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { expression: current, depth } = pending.pop()!;
    if (++count > 1000 || depth > 32) return false;
    if (!isRecord(current)) continue;
    const children =
      current.kind === 'and' || current.kind === 'or'
        ? Array.isArray(current.operands)
          ? current.operands
          : []
        : current.kind === 'not'
          ? [current.operand]
          : current.kind === 'relation-image' && isRecord(current.source)
            ? [current.source.expression]
            : [];
    if (children.length > 1000) return false;
    pending.push(...children.map(child => ({ expression: child, depth: depth + 1 })));
  }
  return true;
};
