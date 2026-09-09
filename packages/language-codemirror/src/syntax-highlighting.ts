import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

export const syntaxPalettes = {
  light: {
    keyword: '#6d28d9',
    entity: '#075985',
    field: '#163d2a',
    operator: '#0e6372',
    string: '#166534',
    literal: '#92400e',
    punctuation: '#52665b',
  },
  dark: {
    keyword: '#c4b5fd',
    entity: '#7dd3fc',
    field: '#dce8e1',
    operator: '#67e8f9',
    string: '#86efac',
    literal: '#fcd34d',
    punctuation: '#b6c8be',
  },
} as const;

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.function(tags.propertyName)], class: 'cm-ontahi-syntax-keyword' },
  { tag: tags.typeName, class: 'cm-ontahi-syntax-entity' },
  { tag: tags.variableName, class: 'cm-ontahi-syntax-field' },
  { tag: tags.operator, class: 'cm-ontahi-syntax-operator' },
  { tag: tags.string, class: 'cm-ontahi-syntax-string' },
  { tag: [tags.bool, tags.number, tags.null, tags.atom], class: 'cm-ontahi-syntax-literal' },
  { tag: tags.punctuation, class: 'cm-ontahi-syntax-punctuation' },
]);

export const ontahiSyntaxHighlighting = (colorScheme: 'light' | 'dark' = 'light') => {
  const palette = syntaxPalettes[colorScheme];
  return [
    syntaxHighlighting(highlight),
    EditorView.theme(
      {
        ...Object.fromEntries(
          Object.entries(palette).map(([name, color]) => [`.cm-ontahi-syntax-${name}`, { color }]),
        ),
        '.cm-ontahi-syntax-keyword': { color: palette.keyword, fontWeight: '600' },
        '.cm-ontahi-semantic-field': { color: palette.field, fontWeight: '600' },
        '.cm-ontahi-semantic-operator': { color: palette.operator },
        '.cm-ontahi-semantic-keyword': { color: palette.keyword, fontWeight: '600' },
      },
      { dark: colorScheme === 'dark' },
    ),
  ];
};
