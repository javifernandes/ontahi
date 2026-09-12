import { parseConsoleSyntax } from '../console/syntax.js';
import { parser } from '../generated/selection-parser.js';
import type { ConsoleGraphReadSyntax } from '../model/contracts.js';

import type { Dialect, ConsoleCandidate } from './contract.js';
import { completeDeclarativeConsoleDocument } from './declarative-completion.js';

const print = (document: string, expression: ConsoleGraphReadSyntax): string => {
  const entity = expression.entity!.text;
  const selection = expression.selection
    ? document.slice(expression.selection.from, expression.selection.to)
    : undefined;
  const field = expression.orderBy?.field?.text;
  const descending = ['desc', 'descending'].includes(expression.orderBy?.direction?.text ?? '');
  const terminal = expression.terminal?.text ?? 'many';
  const limit = expression.limitValue?.text;

  return [
    entity,
    ...expression.steps.map((step, index) => {
      if (step.kind === 'factory')
        return `${index ? 'and by' : 'by'} ${step.name!.text} ${step.argument!.text}`;
      if (step.kind === 'navigation') return `through ${step.name!.text}`;
      return `where ${document.slice(step.selection!.from, step.selection!.to)}`;
    }),
    ...(field ? [`order by ${field}${descending ? ' descending' : ''}`] : []),
    ...(limit === undefined ? [] : [`limit ${limit}`]),
    terminal,
  ].join(' ');
};

const renderCompletion: Dialect['renderCompletion'] = (candidate: ConsoleCandidate) => {
  switch (candidate.kind) {
    case 'factory': {
      const label = candidate.repeated ? 'and by' : 'by';
      return { label, apply: label + ' ', kind: 'keyword', detail: 'Named Selection factory' };
    }
    case 'filter':
      return { label: 'where', apply: 'where ', kind: 'keyword', detail: 'Selection' };
    case 'order':
      return {
        label: 'order by',
        apply: 'order by ',
        kind: 'member',
        detail: 'Graph Read ordering',
      };
    case 'limit':
      return { label: 'limit', apply: 'limit ', kind: 'member', detail: 'Graph Read row limit' };
    case 'terminal':
      return {
        label: candidate.name,
        apply: candidate.name,
        kind: 'member',
        detail: candidate.detail,
      };
    case 'navigation':
      return {
        label: 'through ' + candidate.name,
        apply: 'through ' + candidate.name + ' ',
        kind: 'member',
        detail: 'Contextual Selection → ' + candidate.target,
      };
  }
};

export const declarativeDialect: Dialect = {
  id: 'declarative',
  parser: parser.configure({ top: 'DeclarativeConsoleDocument' }),
  implicitMany: true,
  directions: ['ascending', 'descending'],
  directionSeparator: ' ',
  factoryNameSeparator: ' ',
  parse: document => parseConsoleSyntax(document, declarativeDialect),
  print,
  complete: (document, position, application, options, analyzePrefix) =>
    completeDeclarativeConsoleDocument(
      document,
      position,
      application,
      options,
      analyzePrefix,
      declarativeDialect,
    ),
  renderCompletion,
  orderClause: order =>
    ' order by ' + order.fieldName + (order.direction === 'asc' ? '' : ' descending'),
  limitClause: limit => ' limit ' + limit,
  syntaxError: () =>
    'Expected Entity, optional by factory argument (and by factory argument)*, optional where predicate, order by Field [ascending|descending], limit number, and terminal (many, first, one, count, exists).',
  unsupportedOrder: terminal => 'order by cannot be combined with ' + terminal + '.',
  unsupportedLimit: 'limit can only be combined with many (the default terminal).',
};
