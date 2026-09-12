import { parseConsoleSyntax, consoleStructureDiagnosticMessage } from '../console/syntax.js';
import { parser } from '../generated/selection-parser.js';
import type { ConsoleGraphReadSyntax } from '../model/contracts.js';

import type { Dialect, ConsoleCandidate } from './contract.js';
import { completeTsConsoleDocument } from './ts-completion.js';

const print = (document: string, expression: ConsoleGraphReadSyntax): string => {
  const entity = expression.entity!.text;
  const field = expression.orderBy?.field?.text;
  const descending = ['desc', 'descending'].includes(expression.orderBy?.direction?.text ?? '');
  const terminal = expression.terminal?.text ?? 'many';
  const limit = expression.limitValue?.text;

  return [
    entity,
    ...expression.steps.map(step => {
      if (step.kind === 'factory') return `.by({ ${step.name!.text}: ${step.argument!.text} })`;
      if (step.kind === 'navigation') return `.${step.name!.text}`;
      return `.where(${document.slice(step.selection!.from, step.selection!.to)})`;
    }),
    ...(field ? [`.orderBy(${field}${descending ? ', desc' : ''})`] : []),
    ...(limit === undefined ? [] : [`.limit(${limit})`]),
    `.${terminal}()`,
  ].join('');
};

const renderCompletion: Dialect['renderCompletion'] = (candidate: ConsoleCandidate) => {
  switch (candidate.kind) {
    case 'factory': {
      const label = 'by';
      return { label, apply: 'by({', kind: 'keyword', detail: 'Named Selection factory' };
    }
    case 'filter':
      return { label: 'where', apply: 'where(', kind: 'keyword', detail: 'Selection' };
    case 'order':
      return { label: 'orderBy', apply: 'orderBy(', kind: 'member', detail: 'Graph Read ordering' };
    case 'limit':
      return { label: 'limit', apply: 'limit(', kind: 'member', detail: 'Graph Read row limit' };
    case 'terminal':
      return {
        label: candidate.name,
        apply: candidate.name + '()',
        kind: 'member',
        detail: candidate.detail,
      };
    case 'navigation':
      return {
        label: candidate.name,
        apply: candidate.name,
        kind: 'member',
        detail: 'Contextual Selection → ' + candidate.target,
      };
  }
};

export const tsDialect: Dialect = {
  id: 'ts',
  parser: parser.configure({ top: 'ConsoleDocument' }),
  implicitMany: false,
  directions: ['asc', 'desc'],
  directionSeparator: ', ',
  factoryNameSeparator: ': ',
  parse: document => parseConsoleSyntax(document, tsDialect),
  print,
  complete: (document, position, application, options, analyzePrefix) =>
    completeTsConsoleDocument(document, position, application, options, analyzePrefix, tsDialect),
  renderCompletion,
  orderClause: order =>
    '.orderBy(' + order.fieldName + (order.direction === 'asc' ? '' : ', desc') + ')',
  limitClause: limit => '.limit(' + limit + ')',
  syntaxError: consoleStructureDiagnosticMessage,
  unsupportedOrder: terminal => '.orderBy(...) cannot be combined with .' + terminal + '().',
  unsupportedLimit: '.limit(...) can only be combined with .many().',
};
