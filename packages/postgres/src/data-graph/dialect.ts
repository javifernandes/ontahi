import type { SqlDialect } from '@ontahi/sql';
export const postgresDialect: SqlDialect = {
  quoteIdentifier: identifier => `"${identifier.replaceAll('"', '""')}"`,
  placeholder: index => `$${index}`,
  countExpression: 'COUNT(*)::int',
  order: (expression, direction, nulls) =>
    `${expression} ${direction.toUpperCase()} NULLS ${nulls.toUpperCase()}`,
};
