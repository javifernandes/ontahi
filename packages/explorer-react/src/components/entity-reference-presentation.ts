import type { ExplorerEntityDisplayDescriptor } from '../contracts/index.js';

export const toExplorerReferenceDisplayString = (value: unknown) => {
  if (value == null) return '';
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value);
};

const rowDisplayValues = (row: Record<string, unknown>, fields: readonly string[] = []) =>
  fields.map(field => toExplorerReferenceDisplayString(row[field])).filter(Boolean);

export const getExplorerReferenceRowPrimaryLabel = (
  row: Record<string, unknown>,
  display?: ExplorerEntityDisplayDescriptor,
) =>
  rowDisplayValues(row, display?.primary ? [display.primary] : [])[0] ||
  toExplorerReferenceDisplayString(row.title) ||
  toExplorerReferenceDisplayString(row.displayName) ||
  toExplorerReferenceDisplayString(row.email) ||
  toExplorerReferenceDisplayString(row.slug) ||
  toExplorerReferenceDisplayString(row.id) ||
  Object.values(row).map(toExplorerReferenceDisplayString).find(Boolean) ||
  'Untitled row';

export const getExplorerReferenceRowSecondaryLabel = (
  row: Record<string, unknown>,
  display?: ExplorerEntityDisplayDescriptor,
) => [...new Set(rowDisplayValues(row, display?.secondary))].join(' · ');
