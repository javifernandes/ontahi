import { startCompletion, type CompletionSource } from '@codemirror/autocomplete';
import { Facet, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import {
  analyzeSelectionDocument,
  getSelectionReferenceValueContext,
  type SelectionExpressionSyntax,
  type SelectionLanguageEntityReflection,
  type SelectionLanguageFieldReflection,
  type SelectionLanguageRange,
  type SelectionPredicateSyntax,
  type SelectionScalarLiteralSyntax,
} from '@ontahi/language';

import { selectionExpressionEntity } from './selection-state.js';

export type SelectionReferenceValueOption = {
  readonly value: string;
  readonly label: string;
  readonly detail?: string;
};

export type SelectionReferenceValueRequest = {
  readonly fieldName: string;
  readonly targetEntityName: string;
  readonly identityField: string;
  readonly signal: AbortSignal;
};

export type SelectionReferenceValueSearchRequest = SelectionReferenceValueRequest & {
  readonly query: string;
};

export type SelectionReferenceValueResolveRequest = SelectionReferenceValueRequest & {
  readonly value: string;
};

export type SelectionReferenceValueProvider = {
  readonly search: (
    request: SelectionReferenceValueSearchRequest,
  ) => Promise<readonly SelectionReferenceValueOption[]>;
  readonly resolve: (
    request: SelectionReferenceValueResolveRequest,
  ) => Promise<SelectionReferenceValueOption | undefined>;
};

export type SelectionReferenceValueProjection = SelectionLanguageRange & {
  readonly fieldName: string;
  readonly targetEntityName: string;
  readonly identityField: string;
  readonly value: string;
};

export const selectionReferenceValueProvider = Facet.define<
  SelectionReferenceValueProvider,
  SelectionReferenceValueProvider | undefined
>({ combine: values => values.at(-1) });

const referenceIdentityField = (field: SelectionLanguageFieldReflection) =>
  field.reference?.identity?.fields.length === 1 ? field.reference.identity.fields[0] : undefined;

const projectionForLiteral = (
  literal: SelectionScalarLiteralSyntax,
  field: SelectionLanguageFieldReflection,
): SelectionReferenceValueProjection | undefined => {
  const identityField = referenceIdentityField(field);
  return identityField &&
    field.reference &&
    literal.kind === 'string-literal' &&
    literal.value !== undefined
    ? {
        from: literal.from,
        to: literal.to,
        fieldName: field.name,
        targetEntityName: field.reference.entityName,
        identityField,
        value: literal.value,
      }
    : undefined;
};

const predicateProjections = (
  predicate: SelectionPredicateSyntax,
  entity: SelectionLanguageEntityReflection,
): readonly SelectionReferenceValueProjection[] => {
  if (
    !predicate.field ||
    !predicate.operator ||
    !['eq', 'in'].includes(predicate.operator.operator) ||
    !predicate.value
  ) {
    return [];
  }
  const field = entity.fields.find(candidate => candidate.name === predicate.field?.text);
  if (!field?.reference) return [];
  const literals =
    predicate.value.kind === 'list-literal' ? predicate.value.values : [predicate.value];
  return literals.flatMap(literal => projectionForLiteral(literal, field) ?? []);
};

const expressionProjections = (
  expression: SelectionExpressionSyntax,
  entity: SelectionLanguageEntityReflection,
): readonly SelectionReferenceValueProjection[] => {
  switch (expression.kind) {
    case 'predicate':
      return predicateProjections(expression, entity);
    case 'and':
    case 'or':
      return expression.operands.flatMap(operand => expressionProjections(operand, entity));
    case 'not':
      return expression.operand ? expressionProjections(expression.operand, entity) : [];
    case 'parenthesized':
      return expression.expression ? expressionProjections(expression.expression, entity) : [];
    default:
      return [];
  }
};

export const deriveSelectionReferenceValueProjections = (
  document: string,
  entity: SelectionLanguageEntityReflection,
): readonly SelectionReferenceValueProjection[] => {
  const analysis = analyzeSelectionDocument(document, entity);
  return analysis.selection && analysis.syntax.expression
    ? expressionProjections(analysis.syntax.expression, entity)
    : [];
};

const referenceQuery = (document: string, from: number, to: number, value?: string) => {
  if (value !== undefined) return '';
  return document.slice(from, to).replace(/^"/, '').replace(/"$/, '');
};

export const selectionReferenceValueCompletionSource: CompletionSource = async context => {
  const provider = context.state.facet(selectionReferenceValueProvider);
  const entity = context.state.facet(selectionExpressionEntity);
  if (!provider || !entity) return null;
  const document = context.state.doc.toString();
  const reference = getSelectionReferenceValueContext(document, context.pos, entity);
  if (!reference) return null;

  const controller = new AbortController();
  context.addEventListener('abort', () => controller.abort(), { onDocChange: true });
  let options: readonly SelectionReferenceValueOption[];
  try {
    options = await provider.search({
      fieldName: reference.fieldName,
      targetEntityName: reference.targetEntityName,
      identityField: reference.identityField,
      query: referenceQuery(document, reference.from, reference.to, reference.value),
      signal: controller.signal,
    });
  } catch {
    return null;
  }
  if (context.aborted) return null;

  return {
    from: reference.from,
    to: reference.to,
    filter: false,
    options: options.map(option => ({
      label: option.label,
      displayLabel: option.label,
      detail: [option.detail, option.value].filter(Boolean).join(' · '),
      apply: (view, _completion, from, to) => {
        const currentEntity = view.state.facet(selectionExpressionEntity);
        const currentReference = currentEntity
          ? getSelectionReferenceValueContext(
              view.state.doc.toString(),
              view.state.selection.main.head,
              currentEntity,
            )
          : undefined;
        const range = currentReference ?? { from, to };
        const text = JSON.stringify(option.value);
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: text },
          selection: { anchor: range.from + text.length },
          userEvent: 'input.complete.ontahi-reference',
        });
      },
      type: 'constant',
    })),
    update: () => null,
  };
};

export const selectionReferenceValuePasteExtension = EditorView.domEventHandlers({
  paste(event, view) {
    const entity = view.state.facet(selectionExpressionEntity);
    const pasted = event.clipboardData?.getData('text/plain');
    if (!entity || !pasted || pasted.includes('\n') || pasted.includes('\r')) return false;
    const selection = view.state.selection.main;
    const reference = getSelectionReferenceValueContext(
      view.state.doc.toString(),
      selection.head,
      entity,
    );
    if (!reference) return false;

    let value = pasted.trim();
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') value = parsed;
    } catch {
      // A directly pasted identity is source-encoded below.
    }
    if (!value) return false;

    event.preventDefault();
    const text = JSON.stringify(value);
    view.dispatch({
      changes: { from: reference.from, to: reference.to, insert: text },
      selection: { anchor: reference.from + text.length },
      userEvent: 'input.paste.ontahi-reference',
    });
    return true;
  },
});

type ResolvedReferenceValue = {
  readonly key: string;
  readonly option?: SelectionReferenceValueOption;
};

const resolvedReferenceValue = StateEffect.define<ResolvedReferenceValue>();
const revealReferenceValueProjection = StateEffect.define<SelectionLanguageRange>();

const revealedReferenceValueProjection = StateField.define<SelectionLanguageRange | undefined>({
  create: () => undefined,
  update: (current, transaction) => {
    let next = transaction.docChanged ? undefined : current;
    for (const effect of transaction.effects) {
      if (effect.is(revealReferenceValueProjection)) next = effect.value;
    }
    return next;
  },
});

const projectionKey = (projection: SelectionReferenceValueProjection) =>
  `${projection.fieldName}\u0000${projection.targetEntityName}\u0000${projection.identityField}\u0000${projection.value}`;

const sameRange = (left: SelectionLanguageRange | undefined, right: SelectionLanguageRange) =>
  left?.from === right.from && left.to === right.to;

class ReferenceValueWidget extends WidgetType {
  constructor(
    readonly entityName: string,
    readonly projection: SelectionReferenceValueProjection,
    readonly option: SelectionReferenceValueOption,
  ) {
    super();
  }

  eq(other: ReferenceValueWidget) {
    return (
      this.entityName === other.entityName &&
      this.projection.from === other.projection.from &&
      this.projection.to === other.projection.to &&
      this.projection.value === other.projection.value &&
      this.option.label === other.option.label &&
      this.option.detail === other.option.detail
    );
  }

  toDOM(view: EditorView) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-ontahi-reference-value';
    button.contentEditable = 'false';
    button.setAttribute(
      'aria-label',
      `Value for ${this.entityName}.${this.projection.fieldName}: ${this.option.label}, ${this.projection.value}`,
    );
    button.setAttribute('aria-keyshortcuts', 'Enter, Space, Escape, Backspace, Delete');
    button.title = `${this.option.label} · ${this.projection.value}. Activate to search or edit.`;

    const label = document.createElement('span');
    label.className = 'cm-ontahi-reference-value-label';
    label.textContent = this.option.label;
    const identity = document.createElement('span');
    identity.className = 'cm-ontahi-reference-value-identity';
    identity.textContent = this.projection.value;
    button.append(label, identity);

    const reveal = (openCompletion: boolean) => {
      view.dispatch({
        effects: revealReferenceValueProjection.of(this.projection),
        selection: { anchor: this.projection.from, head: this.projection.to },
        scrollIntoView: true,
      });
      view.focus();
      if (openCompletion) startCompletion(view);
    };
    button.addEventListener('click', () => reveal(true));
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        reveal(false);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        event.stopPropagation();
        view.dispatch({
          changes: { from: this.projection.from, to: this.projection.to },
          selection: { anchor: this.projection.from },
          userEvent: 'delete.ontahi-projection',
        });
        view.focus();
      }
    });
    return button;
  }
}

const referenceValueProjectionTheme = EditorView.theme({
  '.cm-ontahi-reference-value': {
    display: 'inline-flex',
    maxWidth: '20rem',
    alignItems: 'baseline',
    gap: '0.45rem',
    margin: '0 0.08rem',
    border: '1px solid hsl(var(--border, 137 14% 82%))',
    borderRadius: '9999px',
    padding: '0.08rem 0.55rem',
    background: 'hsl(var(--accent, 132 22% 91%))',
    color: 'hsl(var(--accent-foreground, 151 25% 20%))',
    font: 'inherit',
    lineHeight: '1.35',
    cursor: 'pointer',
  },
  '.cm-ontahi-reference-value:focus-visible': {
    outline: '2px solid hsl(var(--ring, 154 43% 28%) / 0.45)',
    outlineOffset: '1px',
  },
  '.cm-ontahi-reference-value-label': {
    overflow: 'hidden',
    fontWeight: '600',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '.cm-ontahi-reference-value-identity': {
    overflow: 'hidden',
    maxWidth: '9rem',
    color: 'hsl(var(--muted-foreground, 145 9% 43%))',
    fontSize: '0.75em',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

const referenceValueDecorations = (
  view: EditorView,
  entity: SelectionLanguageEntityReflection,
  values: ReadonlyMap<string, SelectionReferenceValueOption | undefined>,
): DecorationSet => {
  const revealed = view.state.field(revealedReferenceValueProjection);
  return Decoration.set(
    deriveSelectionReferenceValueProjections(view.state.doc.toString(), entity).flatMap(
      projection => {
        const option = values.get(projectionKey(projection));
        return option && !sameRange(revealed, projection)
          ? [
              Decoration.replace({
                widget: new ReferenceValueWidget(entity.name, projection, option),
              }).range(projection.from, projection.to),
            ]
          : [];
      },
    ),
    true,
  );
};

export const selectionReferenceValueProjectionExtensions = (
  entity: SelectionLanguageEntityReflection,
): readonly Extension[] => {
  const projectionPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      readonly values = new Map<string, SelectionReferenceValueOption | undefined>();
      readonly pending = new Map<string, AbortController>();
      destroyed = false;

      constructor(readonly view: EditorView) {
        this.decorations = referenceValueDecorations(view, entity, this.values);
        this.resolveCurrentValues();
      }

      update(update: ViewUpdate) {
        for (const transaction of update.transactions) {
          for (const effect of transaction.effects) {
            if (effect.is(resolvedReferenceValue)) {
              this.pending.delete(effect.value.key);
              this.values.set(effect.value.key, effect.value.option);
            }
          }
        }
        if (
          update.docChanged ||
          update.transactions.some(transaction =>
            transaction.effects.some(
              effect =>
                effect.is(resolvedReferenceValue) || effect.is(revealReferenceValueProjection),
            ),
          )
        ) {
          this.decorations = referenceValueDecorations(update.view, entity, this.values);
          this.resolveCurrentValues();
        }
      }

      resolveCurrentValues() {
        const provider = this.view.state.facet(selectionReferenceValueProvider);
        if (!provider) return;
        const projections = deriveSelectionReferenceValueProjections(
          this.view.state.doc.toString(),
          entity,
        );
        const currentKeys = new Set(projections.map(projectionKey));
        for (const [key, controller] of this.pending) {
          if (!currentKeys.has(key)) {
            controller.abort();
            this.pending.delete(key);
          }
        }
        for (const projection of projections) {
          const key = projectionKey(projection);
          if (this.values.has(key) || this.pending.has(key)) continue;
          const controller = new AbortController();
          this.pending.set(key, controller);
          void provider
            .resolve({
              fieldName: projection.fieldName,
              targetEntityName: projection.targetEntityName,
              identityField: projection.identityField,
              value: projection.value,
              signal: controller.signal,
            })
            .then(option => {
              if (!this.destroyed && !controller.signal.aborted) {
                this.view.dispatch({ effects: resolvedReferenceValue.of({ key, option }) });
              }
            })
            .catch(() => {
              if (!this.destroyed && !controller.signal.aborted) {
                this.pending.delete(key);
              }
            });
        }
      }

      destroy() {
        this.destroyed = true;
        for (const controller of this.pending.values()) controller.abort();
        this.pending.clear();
      }
    },
    { decorations: value => value.decorations },
  );

  return [
    revealedReferenceValueProjection,
    projectionPlugin,
    EditorView.atomicRanges.of(
      view => view.plugin(projectionPlugin)?.decorations ?? Decoration.none,
    ),
    referenceValueProjectionTheme,
  ];
};
