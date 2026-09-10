import type { ConsoleDialect, ConsoleGraphReadSyntax } from './index.js';

/** Print validated authoring structure, not a request: first and exists can share a wire body. */
export const renderConsoleDialect = (
  document: string,
  expression: ConsoleGraphReadSyntax,
  dialect: ConsoleDialect,
): string => {
  const entity = expression.entity!.text;
  const selection = expression.selection
    ? document.slice(expression.selection.from, expression.selection.to)
    : undefined;
  const field = expression.orderBy?.field?.text;
  const descending = ['desc', 'descending'].includes(expression.orderBy?.direction?.text ?? '');
  const terminal = expression.terminal?.text ?? 'many';
  const limit = expression.limitValue?.text;

  if (dialect === 'declarative') {
    return [
      entity,
      ...expression.factories.map(
        (factory, index) =>
          `${index ? 'and by' : 'by'} ${factory.name!.text} ${factory.argument!.text}`,
      ),
      ...(selection ? [`where ${selection}`] : []),
      ...(field ? [`order by ${field}${descending ? ' descending' : ''}`] : []),
      ...(limit === undefined ? [] : [`limit ${limit}`]),
      terminal,
    ].join(' ');
  }
  return [
    entity,
    ...expression.factories.map(
      factory => `.by({ ${factory.name!.text}: ${factory.argument!.text} })`,
    ),
    ...(selection ? [`.where(${selection})`] : []),
    ...(field ? [`.orderBy(${field}${descending ? ', desc' : ''})`] : []),
    ...(limit === undefined ? [] : [`.limit(${limit})`]),
    `.${terminal}()`,
  ].join('');
};
