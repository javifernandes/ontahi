import type { AnyEntityDefinition } from '../../../model/entity/definition.js';
import {
  createEntityRef,
  isEntityRef,
  isEntityRefLocatorValue,
  normalizeEntityRef,
  type EntityRefLocatorValue,
} from '../../../model/entity/ref/model.js';
import { isRecord } from '../../../value/object.js';

import type { EntityLocatorRef } from './records.js';

const normalizeOutputCacheKeyValue = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): string => {
  if (isEntityRef(value)) return `ref(${normalizeEntityRef(value)})`;
  if (value === undefined) return 'undefined';
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return JSON.stringify(value);
  if (typeof value === 'bigint') return `bigint(${value.toString()})`;
  if (value instanceof Date) return `date(${value.toISOString()})`;
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return `[${value.map(item => normalizeOutputCacheKeyValue(item, seen)).join(',')}]`;
  }
  if (isRecord(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return `{${Object.keys(value)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)) // NOSONAR -- cache compatibility requires locale-independent code-unit order.
      .map(key => `${JSON.stringify(key)}:${normalizeOutputCacheKeyValue(value[key], seen)}`)
      .join(',')}}`;
  }
  if (typeof value === 'symbol') return `symbol(${value.description ?? ''})`;
  if (typeof value === 'function')
    return `function(${JSON.stringify(Function.prototype.toString.call(value))})`;
  return `object(${Object.prototype.toString.call(value)})`;
};

export const normalizeOutputCacheKey = (key: readonly unknown[]): string =>
  normalizeOutputCacheKeyValue(key);

export const createEntityLocatorRefs = <
  TEntity extends AnyEntityDefinition,
  TSnapshot extends Record<string, unknown>,
>(
  entityDefinition: TEntity,
  snapshot: TSnapshot,
): EntityLocatorRef<TEntity['name']>[] =>
  Object.entries(entityDefinition.refLocators).flatMap(([name, locator]) => {
    if (!locator.fields || locator.fields.length === 0) return [];
    const values = locator.fields.map(fieldName => snapshot[fieldName]);
    if (values.some(value => !isEntityRefLocatorValue(value))) return [];
    return [
      {
        name,
        ref: createEntityRef(
          entityDefinition,
          locator(...(values as readonly EntityRefLocatorValue[])),
        ),
      },
    ];
  });
