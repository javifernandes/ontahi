import { isolateHistory } from '@codemirror/commands';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
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
  parseConsoleDocument,
  type ConsoleDialect,
  type ConsoleLanguageApplicationReflection,
  type SelectionExpressionSyntax,
  type SelectionLanguageEntityReflection,
  type SelectionLanguageFieldReflection,
  type SelectionLanguageRange,
  type SelectionPredicateSyntax,
  type SelectionScalarLiteralSyntax,
} from '@ontahi/language';

import {
  consoleOrderProjections,
  type EditorFiniteValueProjection,
} from './console-order-projection.js';

export type SelectionFiniteValueProjectionChoice = {
  readonly label: string;
  readonly text: string;
  readonly value: boolean | string;
};

export type SelectionFiniteValueProjection = SelectionLanguageRange & {
  readonly fieldName: string;
  readonly value: boolean | string;
  readonly choices: readonly SelectionFiniteValueProjectionChoice[];
};

const finiteChoices = (
  field: SelectionLanguageFieldReflection,
): readonly SelectionFiniteValueProjectionChoice[] => {
  if (field.enumValues?.length) {
    return field.enumValues.map(value => ({ label: value, text: JSON.stringify(value), value }));
  }
  return field.type === 'boolean'
    ? [
        { label: 'true', text: 'true', value: true },
        { label: 'false', text: 'false', value: false },
      ]
    : [];
};

const projectionForLiteral = (
  literal: SelectionScalarLiteralSyntax,
  field: SelectionLanguageFieldReflection,
): SelectionFiniteValueProjection | undefined => {
  const choices = finiteChoices(field);
  if (choices.length === 0) return undefined;
  const value = choices.find(choice => choice.value === literal.value)?.value;
  return value !== undefined
    ? {
        from: literal.from,
        to: literal.to,
        fieldName: field.name,
        value,
        choices,
      }
    : undefined;
};

const predicateProjections = (
  predicate: SelectionPredicateSyntax,
  entity: SelectionLanguageEntityReflection,
): readonly SelectionFiniteValueProjection[] => {
  if (
    !predicate.field ||
    !predicate.operator ||
    !predicate.value ||
    !['eq', 'in'].includes(predicate.operator.operator)
  ) {
    return [];
  }
  const field = entity.fields.find(candidate => candidate.name === predicate.field?.text);
  if (!field) return [];
  const value = predicate.value;
  const literals = value.kind === 'list-literal' ? value.values : [value];
  return literals.flatMap(literal => projectionForLiteral(literal, field) ?? []);
};

const expressionProjections = (
  expression: SelectionExpressionSyntax,
  entity: SelectionLanguageEntityReflection,
): readonly SelectionFiniteValueProjection[] => {
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

export const deriveSelectionFiniteValueProjections = (
  document: string,
  entity: SelectionLanguageEntityReflection,
): readonly SelectionFiniteValueProjection[] => {
  const analysis = analyzeSelectionDocument(document, entity);
  return analysis.selection && analysis.syntax.expression
    ? expressionProjections(analysis.syntax.expression, entity)
    : [];
};

type FiniteValueProjectionContext = {
  readonly entityName: string;
  readonly projections: readonly EditorFiniteValueProjection[];
};

const consoleFiniteValueProjectionContext = (
  document: string,
  application: ConsoleLanguageApplicationReflection,
  dialect: ConsoleDialect = 'ts',
): FiniteValueProjectionContext | undefined => {
  const expression = parseConsoleDocument(document, dialect).syntax.expression;
  if (!expression?.entity || !expression.selection) return undefined;
  const selection = expression.selection;
  const entity = application.entities.find(candidate => candidate.name === expression.entity?.text);
  return entity
    ? {
        entityName: entity.name,
        projections: deriveSelectionFiniteValueProjections(
          document.slice(selection.from, selection.to),
          entity,
        ).map(projection => ({
          ...projection,
          from: projection.from + selection.from,
          to: projection.to + selection.from,
        })),
      }
    : undefined;
};

export const deriveConsoleFiniteValueProjections = (
  document: string,
  application: ConsoleLanguageApplicationReflection,
  dialect: ConsoleDialect = 'ts',
): readonly SelectionFiniteValueProjection[] =>
  consoleFiniteValueProjectionContext(document, application, dialect)?.projections ?? [];

const revealFiniteValueProjection = StateEffect.define<SelectionLanguageRange>();

const revealedFiniteValueProjection = StateField.define<SelectionLanguageRange | undefined>({
  create: () => undefined,
  update: (current, transaction) => {
    let next = transaction.docChanged ? undefined : current;
    for (const effect of transaction.effects) {
      if (effect.is(revealFiniteValueProjection)) next = effect.value;
    }
    return next;
  },
});

const sameRange = (left: SelectionLanguageRange | undefined, right: SelectionLanguageRange) =>
  left?.from === right.from && left.to === right.to;

class FiniteValueWidget extends WidgetType {
  constructor(
    readonly entityName: string,
    readonly projection: EditorFiniteValueProjection,
  ) {
    super();
  }

  eq(other: FiniteValueWidget) {
    return (
      this.entityName === other.entityName &&
      this.projection.from === other.projection.from &&
      this.projection.to === other.projection.to &&
      this.projection.value === other.projection.value &&
      this.projection.choices.length === other.projection.choices.length &&
      this.projection.choices.every(
        (choice, index) => choice.text === other.projection.choices[index]?.text,
      )
    );
  }

  toDOM(view: EditorView) {
    const shell = document.createElement('span');
    shell.className = 'cm-ontahi-finite-value';
    shell.contentEditable = 'false';

    const select = document.createElement('select');
    select.className = 'cm-ontahi-finite-value-select';
    select.setAttribute(
      'aria-label',
      this.projection.label ?? `Value for ${this.entityName}.${this.projection.fieldName}`,
    );
    select.setAttribute('aria-keyshortcuts', 'Escape, Backspace, Delete');
    select.title = 'Choose a value. Press Escape to edit the source text.';
    for (const choice of this.projection.choices) {
      const option = document.createElement('option');
      option.value = choice.text;
      option.textContent = choice.label;
      select.append(option);
    }
    const selected = this.projection.choices.find(choice => choice.value === this.projection.value);
    if (!selected) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = this.projection.placeholder ?? 'Choose value';
      placeholder.disabled = true;
      select.prepend(placeholder);
    }
    select.value = selected?.text ?? '';

    const chevron = document.createElement('span');
    chevron.className = 'cm-ontahi-finite-value-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';

    select.addEventListener('change', () => {
      const choice = this.projection.choices.find(candidate => candidate.text === select.value);
      if (!choice) return;
      view.dispatch({
        changes: {
          from: this.projection.from,
          to: this.projection.to,
          insert: choice.text,
        },
        selection: { anchor: this.projection.from + choice.text.length },
        userEvent: 'input.ontahi-projection',
        annotations: isolateHistory.of('full'),
      });
      view.focus();
    });
    select.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        view.dispatch({
          effects: revealFiniteValueProjection.of(this.projection),
          selection: { anchor: this.projection.from, head: this.projection.to },
          scrollIntoView: true,
        });
        view.focus();
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

    shell.append(select, chevron);
    return shell;
  }
}

const finiteValueProjectionTheme = EditorView.theme({
  '.cm-ontahi-finite-value': {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    margin: '0 0.08rem',
    verticalAlign: 'baseline',
  },
  '.cm-ontahi-finite-value-select': {
    appearance: 'none',
    minWidth: '4.25rem',
    border: '1px solid hsl(var(--border, 137 14% 82%))',
    borderRadius: '9999px',
    padding: '0.08rem 1.35rem 0.08rem 0.55rem',
    background: 'hsl(var(--accent, 132 22% 91%))',
    color: 'hsl(var(--accent-foreground, 151 25% 20%))',
    font: 'inherit',
    fontWeight: '600',
    lineHeight: '1.35',
    cursor: 'pointer',
  },
  '.cm-ontahi-finite-value-select:focus-visible': {
    outline: '2px solid hsl(var(--ring, 154 43% 28%) / 0.45)',
    outlineOffset: '1px',
  },
  '.cm-ontahi-finite-value-chevron': {
    position: 'absolute',
    right: '0.45rem',
    pointerEvents: 'none',
    color: 'hsl(var(--muted-foreground, 145 9% 43%))',
    fontSize: '0.75em',
  },
});

const finiteValueDecorations = (
  view: EditorView,
  context: FiniteValueProjectionContext | undefined,
): DecorationSet => {
  if (!context) return Decoration.none;
  const revealed = view.state.field(revealedFiniteValueProjection);
  return Decoration.set(
    context.projections.flatMap(projection =>
      sameRange(revealed, projection)
        ? []
        : [
            (projection.from === projection.to
              ? Decoration.widget({
                  widget: new FiniteValueWidget(context.entityName, projection),
                  side: 1,
                })
              : Decoration.replace({
                  widget: new FiniteValueWidget(context.entityName, projection),
                })
            ).range(projection.from, projection.to),
          ],
    ),
    true,
  );
};

type FiniteValueProjectionContextSource = (
  document: string,
) => FiniteValueProjectionContext | undefined;

const finiteValueProjectionExtensions = (
  context: FiniteValueProjectionContextSource,
): readonly Extension[] => {
  const projectionPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = finiteValueDecorations(view, context(view.state.doc.toString()));
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.transactions.some(transaction =>
            transaction.effects.some(effect => effect.is(revealFiniteValueProjection)),
          )
        ) {
          this.decorations = finiteValueDecorations(
            update.view,
            context(update.state.doc.toString()),
          );
        }
      }
    },
    { decorations: value => value.decorations },
  );

  return [
    revealedFiniteValueProjection,
    projectionPlugin,
    EditorView.atomicRanges.of(
      view => view.plugin(projectionPlugin)?.decorations ?? Decoration.none,
    ),
    finiteValueProjectionTheme,
  ];
};

export const selectionFiniteValueProjectionExtensions = (
  entity: SelectionLanguageEntityReflection,
): readonly Extension[] =>
  finiteValueProjectionExtensions(document => ({
    entityName: entity.name,
    projections: deriveSelectionFiniteValueProjections(document, entity),
  }));

export const consoleFiniteValueProjectionExtensions = (
  application: ConsoleLanguageApplicationReflection,
  dialect: ConsoleDialect = 'ts',
  orderableFields?: (entityName: string) => readonly string[],
): readonly Extension[] =>
  finiteValueProjectionExtensions(document => {
    const values = consoleFiniteValueProjectionContext(document, application, dialect);
    const ordering = consoleOrderProjections(document, application, dialect, orderableFields);
    const entityName = parseConsoleDocument(document, dialect).syntax.expression?.entity?.text;
    return entityName
      ? { entityName, projections: [...(values?.projections ?? []), ...ordering] }
      : undefined;
  });
