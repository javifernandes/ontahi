export type SqlDialect = {
  quoteIdentifier: (identifier: string) => string;
  placeholder: (index: number) => string;
  countExpression: string;
  order: (expression: string, direction: 'asc' | 'desc', nulls: 'first' | 'last') => string;
};
