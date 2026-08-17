import { isPlainObject } from './object.js';

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const isJsonValueAt = (value: unknown, ancestors: Set<object>): value is JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!Array.isArray(value) && !isPlainObject(value)) return false;
  if (ancestors.has(value)) return false;

  ancestors.add(value);
  const entries = Array.isArray(value) ? value : Object.values(value);
  const valid = entries.every(entry => isJsonValueAt(entry, ancestors));
  ancestors.delete(value);

  return valid;
};

export const isJsonValue = (value: unknown): value is JsonValue =>
  isJsonValueAt(value, new Set<object>());

export const cloneJson = <TValue>(value: TValue): TValue => {
  if (!isJsonValue(value)) {
    throw new TypeError('Expected a finite, acyclic JSON value.');
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
};
