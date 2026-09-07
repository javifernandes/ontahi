import {
  autocompletion,
  type Completion,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { deleteCharBackward } from '@codemirror/commands';
import {
  defaultHighlightStyle,
  LRLanguage,
  LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language';
import { linter, type Diagnostic, type LintSource } from '@codemirror/lint';
import { Facet, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  hoverTooltip,
  keymap,
  ViewPlugin,
  type DecorationSet,
  type HoverTooltipSource,
} from '@codemirror/view';
import { styleTags, tags } from '@lezer/highlight';
import {
  analyzeSelectionDocument,
  classifySelectionDocument,
  completeSelectionDocument,
  hoverSelectionDocument,
  type SelectionDocumentAnalysis,
  type SelectionLanguageCompletionItem,
  type SelectionLanguageEntityReflection,
  type SelectionLanguageSemanticClassification,
} from '@ontahi/language';
import { selectionDocumentParser } from '@ontahi/language/lezer';

import { selectionFiniteValueProjectionExtensions } from './finite-value-projection.js';

export {
  deriveSelectionFiniteValueProjections,
  type SelectionFiniteValueProjection,
  type SelectionFiniteValueProjectionChoice,
} from './finite-value-projection.js';

const parser = selectionDocumentParser.configure({
  props: [
    styleTags({
      FieldName: tags.variableName,
      'Equals ComparisonOperator In Is': tags.operator,
      'And Or Not': tags.keyword,
      'All None': tags.atom,
      'True False': tags.bool,
      Null: tags.null,
      NumberLiteral: tags.number,
      StringLiteral: tags.string,
      'OpenParen CloseParen OpenBracket CloseBracket Comma': tags.punctuation,
    }),
  ],
});

export const selectionExpressionLanguage = LRLanguage.define({ parser });

export const selectionExpressionLanguageSupport = () =>
  new LanguageSupport(selectionExpressionLanguage);

const selectionExpressionEntity = Facet.define<
  SelectionLanguageEntityReflection,
  SelectionLanguageEntityReflection | undefined
>({ combine: values => values.at(-1) });

const completionType = (kind: SelectionLanguageCompletionItem['kind']): Completion['type'] =>
  ({
    field: 'variable',
    keyword: 'keyword',
    operator: 'operator',
    value: 'constant',
    punctuation: 'text',
  })[kind];

const completionResult = (
  document: string,
  position: number,
  entity: SelectionLanguageEntityReflection,
): CompletionResult | null => {
  const completion = completeSelectionDocument(document, position, entity);
  if (completion.items.length === 0) return null;
  return {
    from: completion.from,
    to: completion.to,
    options: completion.items.map(item => ({
      label: item.label,
      apply: item.apply,
      type: completionType(item.kind),
      detail: item.detail,
      ...(item.kind === 'field' ? { boost: 10 } : {}),
    })),
    update: (_current, _from, _to, context) => {
      const currentEntity = context.state.facet(selectionExpressionEntity);
      return currentEntity
        ? completionResult(context.state.doc.toString(), context.pos, currentEntity)
        : null;
    },
  };
};

export const selectionExpressionCompletionSource: CompletionSource = context => {
  const entity = context.state.facet(selectionExpressionEntity);
  return entity ? completionResult(context.state.doc.toString(), context.pos, entity) : null;
};

const semanticClassName: Record<SelectionLanguageSemanticClassification['kind'], string> = {
  field: 'cm-ontahi-semantic-field',
  'unsupported-field': 'cm-ontahi-semantic-unsupported',
  'unsupported-relation': 'cm-ontahi-semantic-unsupported',
  'invalid-identifier': 'cm-ontahi-semantic-invalid',
  operator: 'cm-ontahi-semantic-operator',
  value: 'cm-ontahi-semantic-value',
  keyword: 'cm-ontahi-semantic-keyword',
};

export type CodeMirrorSemanticRange = {
  readonly from: number;
  readonly to: number;
  readonly className: string;
};

export const toCodeMirrorSemanticRanges = (
  classifications: readonly SelectionLanguageSemanticClassification[],
): readonly CodeMirrorSemanticRange[] =>
  classifications.flatMap(classification =>
    classification.from < classification.to
      ? [
          {
            from: classification.from,
            to: classification.to,
            className: semanticClassName[classification.kind],
          },
        ]
      : [],
  );

const semanticDecorations = (
  document: string,
  entity: SelectionLanguageEntityReflection,
): DecorationSet =>
  Decoration.set(
    toCodeMirrorSemanticRanges(classifySelectionDocument(document, entity)).map(range =>
      Decoration.mark({ class: range.className }).range(range.from, range.to),
    ),
    true,
  );

const selectionExpressionSemanticHighlighting = (entity: SelectionLanguageEntityReflection) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = semanticDecorations(view.state.doc.toString(), entity);
      }

      update(update: { readonly docChanged: boolean; readonly state: EditorView['state'] }) {
        if (update.docChanged) {
          this.decorations = semanticDecorations(update.state.doc.toString(), entity);
        }
      }
    },
    { decorations: value => value.decorations },
  );

const createHoverDom = (titleText: string, detailText: string, documentationText: string) => {
  const dom = document.createElement('div');
  dom.className = 'cm-ontahi-hover';
  const title = document.createElement('div');
  title.className = 'cm-ontahi-hover-title';
  title.textContent = titleText;
  const detail = document.createElement('div');
  detail.className = 'cm-ontahi-hover-detail';
  detail.textContent = detailText;
  const documentation = document.createElement('div');
  documentation.className = 'cm-ontahi-hover-documentation';
  documentation.textContent = documentationText;
  dom.append(title, detail, documentation);
  return dom;
};

export const selectionExpressionHoverSource: HoverTooltipSource = (view, position, _side) => {
  const entity = view.state.facet(selectionExpressionEntity);
  if (!entity) return null;
  const hover = hoverSelectionDocument(view.state.doc.toString(), position, entity);
  return hover
    ? {
        pos: hover.from,
        end: hover.to,
        above: true,
        create: () => ({
          dom: createHoverDom(hover.title, hover.detail, hover.documentation),
        }),
      }
    : null;
};

const selectionExpressionAssistanceTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    overflow: 'hidden',
    padding: '0.25rem',
    border: '1px solid hsl(var(--border, 137 14% 82%))',
    borderRadius: '0.75rem',
    backgroundColor: 'hsl(var(--popover, 0 0% 100%))',
    color: 'hsl(var(--popover-foreground, 150 23% 11%))',
    boxShadow: '0 12px 30px hsl(var(--foreground, 150 23% 11%) / 0.12)',
  },
  '.cm-tooltip-autocomplete > ul': {
    minWidth: '16rem',
    maxHeight: '15rem',
    padding: '0.125rem',
    fontFamily: 'inherit',
  },
  '.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    minHeight: '2.25rem',
    alignItems: 'center',
    borderRadius: '0.5rem',
    padding: '0.4rem 0.625rem',
    lineHeight: '1.2',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    background: 'hsl(var(--accent, 132 22% 91%))',
    color: 'hsl(var(--accent-foreground, 151 25% 20%))',
  },
  '.cm-completionLabel': {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: '0.8125rem',
    fontWeight: '600',
  },
  '.cm-completionDetail': {
    marginLeft: 'auto',
    paddingLeft: '1rem',
    color: 'hsl(var(--muted-foreground, 145 9% 43%))',
    fontSize: '0.6875rem',
    fontStyle: 'normal',
  },
  '.cm-completionMatchedText': {
    color: 'hsl(var(--primary, 154 43% 28%))',
    fontWeight: '700',
    textDecoration: 'none',
  },
  '.cm-ontahi-semantic-field': {
    color: 'hsl(var(--primary))',
    fontWeight: '600',
  },
  '.cm-ontahi-semantic-operator, .cm-ontahi-semantic-keyword': {
    color: 'hsl(var(--chart-3, var(--primary)))',
  },
  '.cm-ontahi-semantic-invalid, .cm-ontahi-semantic-unsupported': {
    textDecoration: 'underline wavy hsl(var(--destructive))',
    textUnderlineOffset: '0.2em',
  },
  '.cm-ontahi-hover': {
    display: 'grid',
    gap: '0.25rem',
    maxWidth: '24rem',
    padding: '0.625rem 0.75rem',
  },
  '.cm-ontahi-hover-title': { fontWeight: '600' },
  '.cm-ontahi-hover-detail': {
    color: 'hsl(var(--muted-foreground))',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
  },
  '.cm-ontahi-hover-documentation': { fontSize: '0.8125rem' },
});

export const toCodeMirrorDiagnostics = (
  analysis: SelectionDocumentAnalysis,
): readonly Diagnostic[] =>
  [...analysis.syntaxDiagnostics, ...analysis.semanticDiagnostics].map(diagnostic => ({
    from: diagnostic.from,
    to: diagnostic.to,
    severity: 'error',
    source: diagnostic.channel === 'syntax' ? 'Ontahí syntax' : 'Ontahí semantics',
    message: diagnostic.message,
  }));

export const selectionExpressionLinter =
  (entity: SelectionLanguageEntityReflection): LintSource =>
  view =>
    toCodeMirrorDiagnostics(analyzeSelectionDocument(view.state.doc.toString(), entity));

export type SelectionExpressionExtensionOptions = {
  readonly finiteValueProjections?: boolean;
};

export const selectionExpressionExtensions = (
  entity: SelectionLanguageEntityReflection,
  options: SelectionExpressionExtensionOptions = {},
): readonly Extension[] => [
  selectionExpressionEntity.of(entity),
  selectionExpressionLanguageSupport(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  keymap.of([
    {
      key: 'Backspace',
      run: deleteCharBackward,
      shift: deleteCharBackward,
      preventDefault: true,
    },
  ]),
  autocompletion({ override: [selectionExpressionCompletionSource], icons: false }),
  selectionExpressionSemanticHighlighting(entity),
  ...(options.finiteValueProjections ? selectionFiniteValueProjectionExtensions(entity) : []),
  hoverTooltip(selectionExpressionHoverSource, { hideOnChange: true }),
  selectionExpressionAssistanceTheme,
  linter(selectionExpressionLinter(entity), { delay: 0 }),
];
