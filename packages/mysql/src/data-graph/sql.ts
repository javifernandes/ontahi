import { createSqlQueryCompiler, type SqlDialect } from '@ontahi/sql';
export const mysqlDialect: SqlDialect = {
  quoteIdentifier: identifier => `\`${identifier.replaceAll('`', '``')}\``,
  placeholder: () => '?',
  countExpression: 'COUNT(*)',
  order: (expression, direction, nulls) =>
    `${expression} IS NULL ${nulls === 'first' ? 'DESC' : 'ASC'}, ${expression} ${direction.toUpperCase()}`,
};
export const quoteMysqlIdentifier = mysqlDialect.quoteIdentifier;
const compiler = createSqlQueryCompiler(mysqlDialect);
export const compileMysqlQuery = compiler.compileQuery;
export const compileMysqlSelection = compiler.compileSelection;
