import type { GraphSchemaDescriptor } from '@ontahi/core/data-graph';

import type {
  ConsoleLanguageCompletionItem,
  ConsoleLanguageCompletionResult,
} from '../model/contracts.js';

class Reader {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): unknown {
    const value = this.value();
    this.space();
    if (this.position !== this.source.length) throw new Error('Unexpected input.');
    return value;
  }

  private space() {
    while (/\s/.test(this.source[this.position] ?? '')) this.position += 1;
  }

  private value(): unknown {
    this.space();
    const character = this.source[this.position];
    if (character === '{') return this.object();
    if (character === '[') return this.array();
    if (character === '"') return this.string();
    const rest = this.source.slice(this.position);
    for (const [literal, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (rest.startsWith(literal)) {
        this.position += literal.length;
        return value;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest)?.[0];
    if (number) {
      this.position += number.length;
      return Number(number);
    }
    throw new Error('Expected an object, array, string, number, boolean, or null.');
  }

  private string(): string {
    const start = this.position;
    this.position += 1;
    while (this.position < this.source.length) {
      if (this.source[this.position] === '\\') this.position += 2;
      else if (this.source[this.position++] === '"') {
        return JSON.parse(this.source.slice(start, this.position)) as string;
      }
    }
    throw new Error('Unterminated string.');
  }

  private key(): string {
    this.space();
    if (this.source[this.position] === '"') return this.string();
    const identifier = /^[A-Za-z_]\w*/.exec(this.source.slice(this.position))?.[0];
    if (!identifier) throw new Error('Expected an object property name.');
    this.position += identifier.length;
    return identifier;
  }

  private object(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.position += 1;
    this.space();
    while (this.source[this.position] !== '}') {
      const key = this.key();
      this.space();
      if (this.source[this.position++] !== ':')
        throw new Error('Expected ":" after property name.');
      result[key] = this.value();
      this.space();
      if (this.source[this.position] !== ',') break;
      this.position += 1;
      this.space();
      if (this.source[this.position] === '}') break;
    }
    if (this.source[this.position++] !== '}') throw new Error('Expected "}".');
    return result;
  }

  private array(): unknown[] {
    const result: unknown[] = [];
    this.position += 1;
    this.space();
    while (this.source[this.position] !== ']') {
      result.push(this.value());
      this.space();
      if (this.source[this.position] !== ',') break;
      this.position += 1;
      this.space();
      if (this.source[this.position] === ']') break;
    }
    if (this.source[this.position++] !== ']') throw new Error('Expected "]".');
    return result;
  }
}

export const parseStructuredValue = (source: string): unknown => new Reader(source).parse();

export const normalizeStructuredInput = (
  value: unknown,
  descriptor: GraphSchemaDescriptor | undefined,
): unknown => {
  if (!descriptor) return value;
  if (
    descriptor.kind === 'entity-ref' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
    return {
      kind: 'entity-ref',
      entityName: descriptor.entityName,
      locator: value,
    };
  if (descriptor.kind === 'object' && value && typeof value === 'object' && !Array.isArray(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeStructuredInput(entry, descriptor.fields[key]),
      ]),
    );
  if (descriptor.kind === 'array' && Array.isArray(value))
    return value.map(entry => normalizeStructuredInput(entry, descriptor.item));
  if (descriptor.kind === 'record' && value && typeof value === 'object' && !Array.isArray(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeStructuredInput(entry, descriptor.value),
      ]),
    );
  if (
    ['nullable', 'optional', 'default', 'transform', 'refinement', 'named'].includes(
      descriptor.kind,
    )
  )
    return normalizeStructuredInput(
      value,
      (descriptor as Extract<GraphSchemaDescriptor, { item: GraphSchemaDescriptor }>).item,
    );
  return value;
};

const unwrapDescriptor = (descriptor: GraphSchemaDescriptor): GraphSchemaDescriptor =>
  ['nullable', 'optional', 'default', 'transform', 'refinement', 'named'].includes(descriptor.kind)
    ? unwrapDescriptor(
        (descriptor as Extract<GraphSchemaDescriptor, { item: GraphSchemaDescriptor }>).item,
      )
    : descriptor;

const descriptorValue = (descriptor: GraphSchemaDescriptor): string => {
  const value = unwrapDescriptor(descriptor);
  if (value.kind === 'scalar') {
    if (value.type === 'boolean') return 'false';
    if (value.type === 'number') return '0';
    if (value.type === 'enum') return JSON.stringify(value.enumValues?.[0] ?? '');
    return '""';
  }
  if (value.kind === 'literal') return JSON.stringify(value.value);
  if (value.kind === 'array') return '[]';
  if (value.kind === 'object' || value.kind === 'entity-ref' || value.kind === 'record')
    return '{}';
  if (value.kind === 'union') return descriptorValue(value.options[0] ?? { kind: 'void' });
  return 'null';
};

const descriptorDetail = (descriptor: GraphSchemaDescriptor): string => {
  const value = unwrapDescriptor(descriptor);
  if (value.kind === 'scalar') return value.type;
  if (value.kind === 'entity-ref') return `${value.entityName} reference`;
  return value.kind.replace(/^.*\./, '');
};

const rootObjectSegment = (source: string) => {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let segmentStart = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{' || character === '[') depth += 1;
    else if (character === '}' || character === ']') depth -= 1;
    else if (character === ',' && depth === 0) segmentStart = index + 1;
  }
  return depth === 0 && !quoted ? { segment: source.slice(segmentStart), segmentStart } : undefined;
};

export const completeStructuredInput = (
  document: string,
  position: number,
  inputFrom: number,
  descriptor: GraphSchemaDescriptor,
): ConsoleLanguageCompletionResult | undefined => {
  const object = unwrapDescriptor(descriptor);
  if (object.kind !== 'object' || document[inputFrom] !== '{' || position <= inputFrom) return;
  const beforeCursor = document.slice(inputFrom + 1, position);
  const current = rootObjectSegment(beforeCursor);
  if (!current) return;
  const segment = current.segment;
  const fieldValue = /^\s*([A-Za-z_]\w*)\s*:\s*([^,]*)$/.exec(segment);
  if (fieldValue) {
    const field = object.fields[fieldValue[1]!];
    if (!field) return;
    const prefix = fieldValue[2]!.trimStart();
    const from = position - prefix.length;
    const candidate = descriptorValue(field);
    return {
      from,
      to: position,
      items: candidate.startsWith(prefix)
        ? [{ label: candidate, apply: candidate, kind: 'value', detail: descriptorDetail(field) }]
        : [],
    };
  }
  const fieldDraft = /^\s*([A-Za-z_]\w*)?$/.exec(segment);
  if (!fieldDraft) return;
  const prefix = fieldDraft[1] ?? '';
  const used = new Set(
    [...beforeCursor.matchAll(/(?:^|,)\s*([A-Za-z_]\w*)\s*:/g)].map(match => match[1]),
  );
  return {
    from: position - prefix.length,
    to: position,
    items: Object.entries(object.fields)
      .filter(([name]) => !used.has(name) && name.startsWith(prefix))
      .map(
        ([name, field]): ConsoleLanguageCompletionItem => ({
          label: name,
          apply: `${name}: ${descriptorValue(field)}`,
          kind: 'field',
          detail: descriptorDetail(field),
        }),
      ),
  };
};
