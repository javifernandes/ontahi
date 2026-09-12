import {
  isConsoleOrderableField,
  parseConsoleDocument,
  resolveConsoleContext,
  type ConsoleDialect,
  type ConsoleLanguageApplicationReflection,
} from '@ontahi/language';

import type { SelectionFiniteValueProjection } from './finite-value-projection.js';

export type EditorFiniteValueProjection = SelectionFiniteValueProjection & {
  readonly label?: string;
  readonly placeholder?: string;
};

export const consoleOrderProjections = (
  document: string,
  application: ConsoleLanguageApplicationReflection,
  dialect: ConsoleDialect,
  orderableFields?: (entityName: string) => readonly string[],
): readonly EditorFiniteValueProjection[] => {
  const expression = parseConsoleDocument(document, dialect).syntax.expression;
  const entity = resolveConsoleContext(expression, application);
  const order = expression?.orderBy;
  if (!entity || !order) return [];
  // Lezer recovery may synthesize empty Field/direction tokens in a closed clause.
  const selectedField = order.field?.text ? order.field : undefined;
  const selectedDirection = order.direction?.text ? order.direction : undefined;
  // No policy metadata means no projected permission claims.
  const permitted = orderableFields?.(entity.name) ?? [];
  const fields = entity.fields.filter(
    field => isConsoleOrderableField(field) && permitted.includes(field.name),
  );
  const start = dialect === 'ts' ? order.open?.to : order.by?.to;
  if (start === undefined || fields.length === 0) return [];
  if (selectedField && !fields.some(field => field.name === selectedField.text)) return [];
  const fieldPosition = start + (document.slice(start).match(/^\s*/)?.[0].length ?? 0);
  const fieldPrefix =
    !selectedField && dialect === 'declarative' && fieldPosition === start ? ' ' : '';
  const projections: EditorFiniteValueProjection[] = [
    {
      from: selectedField?.from ?? fieldPosition,
      to: selectedField?.to ?? fieldPosition,
      fieldName: 'orderBy',
      label: `Order field for ${entity.name}`,
      placeholder: 'Choose field',
      value: selectedField?.text ?? '',
      choices: fields.map(field => ({
        label: field.name,
        value: field.name,
        text: fieldPrefix + field.name,
      })),
    },
  ];
  if (!selectedField) return projections;
  const directions = dialect === 'ts' ? ['asc', 'desc'] : ['ascending', 'descending'];
  if (selectedDirection && !directions.includes(selectedDirection.text)) return projections;
  const directionPosition = order.comma?.to ?? selectedField.to;
  const prefix = selectedDirection ? '' : dialect === 'ts' && !order.comma ? ', ' : ' ';
  projections.push({
    from: selectedDirection?.from ?? directionPosition,
    to: selectedDirection?.to ?? directionPosition,
    fieldName: 'orderDirection',
    label: `Order direction for ${entity.name}`,
    placeholder: 'Choose direction',
    value: selectedDirection?.text ?? (order.comma ? '' : directions[0]!),
    choices: directions.map(direction => ({
      label: direction,
      value: direction,
      text: prefix + direction,
    })),
  });
  return projections;
};
