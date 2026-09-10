import type { SyntaxNode } from '@lezer/common';
import {
  expandSelectionFactory,
  type GraphSchemaDescriptor,
  type SelectionFactoryDescriptor,
} from '@ontahi/core/data-graph';
import { hasOwn } from '@ontahi/core/value/object';

import type {
  ConsoleLanguageCompletionResult,
  SelectionLanguageRange,
  ConsoleLanguageCompletionItem,
} from './index.js';

export type ConsoleFactorySyntax = SelectionLanguageRange & {
  readonly name?: SelectionLanguageRange & { readonly text: string; readonly value: string };
  readonly argument?: SelectionLanguageRange & { readonly text: string };
  readonly properties?: readonly (SelectionLanguageRange & {
    readonly name?: SelectionLanguageRange & { readonly text: string };
    readonly colon?: SelectionLanguageRange;
    readonly value?: SelectionLanguageRange;
  })[];
  readonly value?: unknown;
  readonly error?: string;
};

const readName = (text: string) => (text.startsWith('"') ? (JSON.parse(text) as string) : text);

const completionName = (text: string) => {
  try {
    return readName(text);
  } catch {
    return undefined;
  }
};

export const parseConsoleFactory = (
  node: SyntaxNode | null,
  document: string,
): ConsoleFactorySyntax | undefined => {
  if (!node) return undefined;
  const name = node.getChild('FactoryName');
  const argument = node.getChild('FactoryArgument');
  const object = argument?.getChild('FactoryObject');
  const syntax = {
    from: node.from,
    to: node.to,
    ...(object
      ? {
          properties: object.getChildren('FactoryProperty').map(property => {
            const key = property.getChild('InputName');
            const colon = property.getChild('Colon');
            const value = property.getChild('ScalarLiteral') ?? property.getChild('Null');
            return {
              from: property.from,
              to: property.to,
              ...(key
                ? { name: { from: key.from, to: key.to, text: document.slice(key.from, key.to) } }
                : {}),
              ...(colon ? { colon: { from: colon.from, to: colon.to } } : {}),
              ...(value ? { value: { from: value.from, to: value.to } } : {}),
            };
          }),
        }
      : {}),
    ...(argument
      ? {
          argument: {
            from: argument.from,
            to: argument.to,
            text: document.slice(argument.from, argument.to),
          },
        }
      : {}),
  };
  let named: ConsoleFactorySyntax['name'];
  try {
    const nameText = name ? document.slice(name.from, name.to) : undefined;
    if (name && nameText)
      named = { from: name.from, to: name.to, text: nameText, value: readName(nameText) };
    const pairs = object?.getChildren('FactoryProperty').map(property => {
      const key = property.getChild('InputName');
      const value = property.getChild('ScalarLiteral') ?? property.getChild('Null');
      if (!key || !value) throw new Error('Expected input: value in the factory argument.');
      return [
        readName(document.slice(key.from, key.to)),
        JSON.parse(document.slice(value.from, value.to)),
      ] as const;
    });
    if (pairs && new Set(pairs.map(([key]) => key)).size !== pairs.length)
      throw new Error('Duplicate factory input names are not allowed.');
    return {
      ...syntax,
      ...(named ? { name: named } : {}),
      ...(argument
        ? { value: pairs ? Object.fromEntries(pairs) : JSON.parse(syntax.argument!.text) }
        : {}),
    };
  } catch (cause) {
    return {
      ...syntax,
      ...(named ? { name: named } : {}),
      error: cause instanceof Error ? cause.message : 'Invalid factory argument.',
    };
  }
};

export const resolveConsoleFactory = (
  factory: ConsoleFactorySyntax,
  entityName: string,
  factories: Readonly<Record<string, SelectionFactoryDescriptor>> = {},
) => {
  const name = factory.name?.value;
  if (!name || !hasOwn(factories, name))
    throw new Error(`Unknown Selection factory ${entityName}.${name ?? '?'}.`);
  const descriptor = factories[name]!;
  if (descriptor.output.entityName !== entityName)
    throw new Error(`Factory ${name} must produce a Selection of ${entityName}.`);
  return expandSelectionFactory(descriptor, factory.value).expression;
};

const valueItems = (schema: GraphSchemaDescriptor): ConsoleLanguageCompletionItem[] => {
  if (schema.kind === 'nullable')
    return [
      ...valueItems(schema.item),
      { label: 'null', apply: 'null', kind: 'value', detail: 'Null' },
    ];
  if (schema.kind !== 'scalar') return [];
  const values =
    schema.type === 'boolean'
      ? [true, false]
      : schema.type === 'enum'
        ? (schema.enumValues ?? [])
        : undefined;
  return values
    ? values.map(value => ({
        label: JSON.stringify(value),
        apply: JSON.stringify(value),
        kind: 'value',
        detail: schema.type,
      }))
    : [
        {
          label: schema.type,
          apply: schema.type === 'number' ? '0' : '""',
          kind: 'value',
          detail: schema.stringConstraints?.format ?? schema.valueType ?? schema.type,
        },
      ];
};

export const completeConsoleFactory = (
  document: string,
  pos: number,
  factory: ConsoleFactorySyntax | undefined,
  factories: Readonly<Record<string, SelectionFactoryDescriptor>> = {},
  dialect: 'ts' | 'declarative' = 'ts',
): ConsoleLanguageCompletionResult | undefined => {
  if (!factory || pos < factory.from || pos > factory.to) return undefined;
  const name = factory.name;
  if (!name || pos <= name.to) {
    const from = name?.from ?? pos;
    return {
      from,
      to: name?.to ?? pos,
      items: Object.keys(factories).map(label => ({
        label,
        apply: `${/^[A-Za-z_]\w*$/.test(label) && !['all', 'none', 'and', 'or', 'not', 'in', 'is', 'null', 'true', 'false'].includes(label) ? label : JSON.stringify(label)}${
          dialect === 'ts'
            ? document
                .slice(name?.to ?? pos)
                .trimStart()
                .startsWith(':')
              ? ''
              : ': '
            : ' '
        }`,
        kind: 'member',
        detail: `Selection factory → ${factories[label]!.output.entityName}`,
      })),
    };
  }
  const descriptor = hasOwn(factories, name.value) ? factories[name.value] : undefined;
  if (!descriptor || descriptor.input.kind !== 'object') return { from: pos, to: pos, items: [] };
  const argument = factory.argument;
  if (argument && pos > argument.to) return undefined;
  const prefix = argument ? document.slice(argument.from, pos) : '';
  if (prefix.trimStart().startsWith('{')) {
    const property = factory.properties?.find(item => pos >= item.from && pos <= item.to);
    if (!property?.colon || pos <= property.colon.from)
      return {
        from: property?.name?.from ?? pos,
        to: property?.name?.to ?? pos,
        items: Object.entries(descriptor.input.fields)
          .filter(
            ([label]) =>
              !factory.properties?.some(
                item => item !== property && item.name && completionName(item.name.text) === label,
              ),
          )
          .map(([label, input]) => ({
            label,
            apply: `${JSON.stringify(label)}${property?.colon ? '' : ': '}`,
            kind: 'field',
            detail: input.kind === 'scalar' ? input.type : input.kind,
          })),
      };
    const key = property.name ? (completionName(property.name.text) ?? '') : '';
    const input = hasOwn(descriptor.input.fields, key) ? descriptor.input.fields[key] : undefined;
    return {
      from: property.value?.from ?? pos,
      to: property.value?.to ?? pos,
      items: input ? valueItems(input) : [],
    };
  }
  const input = descriptor.scalarInput
    ? descriptor.input.fields[descriptor.scalarInput]
    : undefined;
  return {
    from: argument?.from ?? pos,
    to: argument?.to ?? pos,
    items: [
      ...(input ? valueItems(input) : []),
      { label: '{…}', apply: '{', kind: 'value', detail: 'Named inputs' },
    ],
  };
};
