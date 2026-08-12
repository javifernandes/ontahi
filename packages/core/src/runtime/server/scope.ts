import type { LayerScopedOptions } from './layer-types.js';

export const getDefaultDefectLogMessage = (scope: string) => `Unexpected failure in ${scope}`;

const splitIdentifierWords = (value: string) =>
  value
    .replace(/Operation$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();

const getScopeOperationName = (scope: string) => scope.split('.').at(-1) ?? scope;

const trimNoiseWords = (words: string[]) => {
  if (words.length === 0) {
    return words;
  }

  if (words[0] === 'all') {
    return trimNoiseWords(words.slice(1));
  }

  if (words.at(-1) === 'read') {
    return trimNoiseWords(words.slice(0, -1));
  }

  if (words.length === 2 && words[0] === 'reply' && words[1] === 'thread') {
    return ['reply'];
  }

  return words;
};

const toDefaultFailurePhrase = (scope: string) => {
  const [verb, ...restWords] = splitIdentifierWords(getScopeOperationName(scope)).split(/\s+/);
  const words = trimNoiseWords(restWords);
  const target = words.join(' ').trim();

  switch (verb) {
    case 'list':
    case 'get':
    case 'fetch':
      return `load${target ? ` ${target}` : ''}`;
    case 'mark':
    case 'toggle':
    case 'set':
      return `update${target ? ` ${target}` : ''}`;
    case 'reply':
      return `create${target && target !== 'thread' ? ` ${target}` : ' reply'}`;
    default:
      return `${verb}${target ? ` ${target}` : ''}`;
  }
};

export const getDefaultDefectPublicMessage = (scope: string) =>
  `Failed to ${toDefaultFailurePhrase(scope)}`;

const getLayerLocalName = (fn: (...args: any[]) => unknown, explicitName?: string): string => {
  const resolvedName = explicitName ?? fn.name;

  if (resolvedName && resolvedName.trim().length > 0) {
    return resolvedName.trim();
  }

  throw new Error(
    'Layered effect registration requires a stable function name. Pass `name` explicitly or use a named function.',
  );
};

export const getLayerScope = (
  prefix: string,
  fn: (...args: any[]) => unknown,
  options?: LayerScopedOptions,
) =>
  options?.scope ?? `${prefix}.${getLayerLocalName(fn, options?.name).replace(/Operation$/, '')}`;
