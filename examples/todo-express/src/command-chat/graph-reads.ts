import { graphSchema, type GraphReadRequest } from '@ontahi/core/data-graph';
import type { ModelGraphReadExposure, ModelGraphReadResult } from '@ontahi/core/runtime/server';

import { TodoItem, TodoList } from '../todo.js';

const strict = (fields: Parameters<typeof graphSchema.object>[0]) =>
  graphSchema.object(fields, { unknownKeys: 'strict' });
const direction = graphSchema.union([graphSchema.literal('asc'), graphSchema.literal('desc')]);
const all = strict({ kind: graphSchema.literal('all') });
const predicate = (fieldName: string, value: Parameters<typeof strict>[0][string]) =>
  strict({
    kind: graphSchema.literal('predicate'),
    fieldName: graphSchema.literal(fieldName),
    operator: graphSchema.literal('eq'),
    value,
  });
const selection = (entityName: string, expressions: readonly ReturnType<typeof strict>[]) => {
  const simple = graphSchema.union(expressions);
  return strict({
    kind: graphSchema.literal('selection'),
    entityName: graphSchema.literal(entityName),
    expression: graphSchema.union([
      simple,
      strict({ kind: graphSchema.literal('and'), operands: graphSchema.array(simple) }),
    ]),
  });
};
const request = (
  entityName: string,
  mode: 'run' | 'count',
  selectionSchema: ReturnType<typeof strict>,
  orderFields: readonly string[],
) =>
  strict({
    version: graphSchema.literal(1),
    kind: graphSchema.literal('graph-read'),
    mode: graphSchema.literal(mode),
    selection: selectionSchema,
    orderBy: graphSchema.array(
      strict({
        fieldName: graphSchema.union(orderFields.map(field => graphSchema.literal(field))),
        direction,
      }),
    ),
    ...(mode === 'run' ? { limit: graphSchema.literal(100) } : {}),
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resultMessage = (
  response: ModelGraphReadResult,
  fieldName: 'title' | 'name',
  noun: { en: string; es: string },
  language: string,
) => {
  const es = language.toLowerCase().startsWith('es');
  if (typeof response.value === 'number')
    return es
      ? `${response.value} ${noun.es}${response.value === 1 ? '' : 's'}.`
      : `${response.value} matching ${noun.en}${response.value === 1 ? '' : 's'}.`;
  if (!Array.isArray(response.value) || response.value.length === 0)
    return es ? `No hay ${noun.es}s que coincidan.` : `No matching ${noun.en}s.`;
  const labels = response.value
    .filter(isRecord)
    .map(row => row[fieldName])
    .filter((value): value is string => typeof value === 'string');
  const visible = labels.slice(0, 20).map(label => `• ${label}`);
  if (labels.length > visible.length) visible.push(`… ${labels.length - visible.length} more`);
  return `${response.value.length} ${es ? noun.es : `matching ${noun.en}`}${response.value.length === 1 ? '' : 's'}${visible.length ? `:\n${visible.join('\n')}` : '.'}`;
};

export const todoGraphReads = (language = 'en-US'): ModelGraphReadExposure[] => {
  const itemSelection = selection('TodoItem', [
    all,
    predicate('completed', TodoItem.fields.completed),
    predicate('title', TodoItem.fields.title),
    predicate('list', graphSchema.ref(TodoList)),
  ]);
  const listSelection = selection('TodoList', [all, predicate('name', TodoList.fields.name)]);
  const exposure = (
    entityName: 'TodoItem' | 'TodoList',
    mode: 'run' | 'count',
    selectionSchema: ReturnType<typeof strict>,
    orderFields: readonly string[],
    description: string,
    fieldName: 'title' | 'name',
    noun: { en: string; es: string },
  ): ModelGraphReadExposure => ({
    description,
    request: request(entityName, mode, selectionSchema, orderFields),
    validate: (_request: GraphReadRequest) => undefined,
    message: response => resultMessage(response, fieldName, noun, language),
  });
  const es = language.toLowerCase().startsWith('es');
  return [
    exposure(
      'TodoItem',
      'run',
      itemSelection,
      ['title'],
      es
        ? 'Listar ítems, opcionalmente por estado, título o lista.'
        : 'List items, optionally filtered by completion, title, or list.',
      'title',
      { en: 'item', es: 'ítem' },
    ),
    exposure(
      'TodoItem',
      'count',
      itemSelection,
      ['title'],
      es
        ? 'Contar ítems, opcionalmente por estado, título o lista.'
        : 'Count items, optionally filtered by completion, title, or list.',
      'title',
      { en: 'item', es: 'ítem' },
    ),
    exposure(
      'TodoList',
      'run',
      listSelection,
      ['name'],
      es ? 'Listar listas, opcionalmente por nombre.' : 'List lists, optionally filtered by name.',
      'name',
      { en: 'list', es: 'lista' },
    ),
    exposure(
      'TodoList',
      'count',
      listSelection,
      ['name'],
      es ? 'Contar listas, opcionalmente por nombre.' : 'Count lists, optionally filtered by name.',
      'name',
      { en: 'list', es: 'lista' },
    ),
  ];
};
