import type {
  ApplicationModelGraphReadPresentation,
  ModelGraphReadResult,
} from '@ontahi/core/runtime/server';

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

export const todoGraphReadPresentation = (
  kind: 'item' | 'list',
  mode: 'run' | 'count',
  language = 'en-US',
): ApplicationModelGraphReadPresentation => {
  const es = language.toLowerCase().startsWith('es');
  const item = kind === 'item';
  const noun = item ? { en: 'item', es: 'ítem' } : { en: 'list', es: 'lista' };
  const description = item
    ? mode === 'run'
      ? es
        ? 'Listar ítems, opcionalmente por estado, título o lista.'
        : 'List items, optionally filtered by completion, title, or list.'
      : es
        ? 'Contar ítems, opcionalmente por estado, título o lista.'
        : 'Count items, optionally filtered by completion, title, or list.'
    : mode === 'run'
      ? es
        ? 'Listar listas, opcionalmente por nombre.'
        : 'List lists, optionally filtered by name.'
      : es
        ? 'Contar listas, opcionalmente por nombre.'
        : 'Count lists, optionally filtered by name.';
  return {
    description,
    message: response => resultMessage(response, item ? 'title' : 'name', noun, language),
  };
};
