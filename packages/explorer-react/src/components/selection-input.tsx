'use client';

import { useReflectedEntityDataQuery } from '@ontahi/react/graph';
import { Loader2, Search } from 'lucide-react';
import { useDeferredValue, useRef, useState } from 'react';

import type { ExplorerSchemaField } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

type SelectionField = ExplorerSchemaField & {
  selection: NonNullable<ExplorerSchemaField['selection']>;
};

type SelectionRef = {
  kind: 'entity-ref';
  entityName: string;
  locator: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readSelectionExpression = (value: unknown) =>
  isRecord(value) && isRecord(value.expression) ? value.expression : undefined;

const readSelectionRefs = (value: unknown): SelectionRef[] => {
  const expression = readSelectionExpression(value);

  return expression?.kind === 'references' && Array.isArray(expression.refs)
    ? expression.refs.filter(
        (ref): ref is SelectionRef =>
          isRecord(ref) && ref.kind === 'entity-ref' && isRecord(ref.locator),
      )
    : [];
};

const getSelectionExpressionKind = (value: unknown) => {
  const expression = readSelectionExpression(value);

  return expression?.kind === 'all' || expression?.kind === 'none'
    ? expression.kind
    : expression?.kind === 'references'
      ? 'references'
      : 'custom';
};

const displayValue = (value: unknown) =>
  value == null
    ? ''
    : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : JSON.stringify(value);

const rowPrimaryLabel = (row: Record<string, unknown>, primary?: string) =>
  (primary ? displayValue(row[primary]) : '') ||
  displayValue(row.title) ||
  displayValue(row.displayName) ||
  displayValue(row.email) ||
  displayValue(row.slug) ||
  displayValue(row.id) ||
  'Untitled row';

const rowSecondaryLabel = (
  row: Record<string, unknown>,
  secondary: readonly string[] = [],
  identityFields: readonly string[] = [],
) =>
  [
    ...new Set([
      ...secondary.map(field => displayValue(row[field])),
      identityFields
        .map(field => displayValue(row[field]))
        .filter(Boolean)
        .join(' · '),
    ]),
  ]
    .filter(Boolean)
    .join(' · ');

const refKey = (ref: SelectionRef) => JSON.stringify(ref.locator);

export const ExplorerSelectionInput = ({
  field,
  onChange,
  value,
}: {
  field: SelectionField;
  onChange: (value: unknown) => void;
  value: unknown;
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const identity = field.selection.identity;
  const refs = readSelectionRefs(value);
  const selectedKeys = new Set(refs.map(refKey));
  const selectionKind = getSelectionExpressionKind(value);
  const scopeKinds =
    field.selection.cardinality === 'many'
      ? (['none', 'references', 'all'] as const)
      : (['none', 'references'] as const);
  const dataQuery = useReflectedEntityDataQuery(
    {
      entityName: field.selection.entityName,
      search: deferredQuery,
      pageSize: 8,
    },
    {
      enabled: Boolean(identity) && isOpen,
      refetchOnMount: 'always',
      staleTime: 0,
    },
  );
  const selectExpression = (expression: Record<string, unknown>) =>
    onChange({
      kind: 'selection',
      entityName: field.selection.entityName,
      expression,
    });
  const toggleRow = (row: Record<string, unknown>) => {
    if (!identity) return;
    const ref: SelectionRef = {
      kind: 'entity-ref',
      entityName: field.selection.entityName,
      locator: Object.fromEntries(
        identity.fields.map(locatorField => [locatorField, row[locatorField]]),
      ),
    };
    const key = refKey(ref);
    const nextRefs =
      field.selection.cardinality === 'one'
        ? [ref]
        : selectedKeys.has(key)
          ? refs.filter(current => refKey(current) !== key)
          : [...refs, ref];

    selectExpression(
      nextRefs.length === 0 ? { kind: 'none' } : { kind: 'references', refs: nextRefs },
    );
  };

  return (
    <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
      <span className='truncate text-sm font-medium text-foreground'>{field.path}</span>
      <div
        role='radiogroup'
        aria-label={`${field.path} scope`}
        className='inline-flex overflow-hidden rounded-md border bg-background p-0.5'
      >
        {scopeKinds.map(kind => (
          <button
            key={kind}
            type='button'
            role='radio'
            aria-label={
              kind === 'none' ? 'None' : kind === 'all' ? 'All' : `Selected (${refs.length})`
            }
            aria-checked={selectionKind === kind}
            onClick={() => {
              if (kind === 'references') {
                setIsOpen(true);
                inputRef.current?.focus();
                return;
              }
              selectExpression({ kind });
            }}
            className={cx(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              selectionKind === kind
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {kind === 'none' ? 'None' : kind === 'all' ? 'All' : `Selected (${refs.length})`}
          </button>
        ))}
      </div>

      {identity ? (
        <div className='relative min-w-[14rem] flex-1'>
          <Search className='pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
          <input
            ref={inputRef}
            value={query}
            onFocus={() => setIsOpen(true)}
            onBlur={() => globalThis.setTimeout(() => setIsOpen(false), 150)}
            onChange={event => setQuery(event.target.value)}
            placeholder={`Choose ${field.selection.entityName}${field.selection.cardinality === 'many' ? 's' : ''}`}
            aria-label={`Choose ${field.selection.entityName}`}
            className='min-h-8 w-full rounded-md border bg-background pl-8 pr-8 text-sm outline-none focus:border-primary'
          />
          {refs.length > 0 ? (
            <span className='absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-primary'>
              {refs.length}
            </span>
          ) : null}
          {isOpen ? (
            <div className='absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg'>
              {dataQuery.isFetching ? (
                <div
                  role='status'
                  className='flex items-center gap-2 px-2.5 py-3 text-sm text-muted-foreground'
                >
                  <Loader2 className='size-3.5 shrink-0 animate-spin' />
                  <span>Loading {field.selection.entityName}…</span>
                </div>
              ) : null}
              {!dataQuery.isFetching
                ? (dataQuery.data?.rows ?? []).map((row, index) => {
                    const locator = Object.fromEntries(
                      identity.fields.map(locatorField => [locatorField, row[locatorField]]),
                    );
                    const selected = selectedKeys.has(JSON.stringify(locator));
                    const primary = rowPrimaryLabel(row, dataQuery.data?.display?.primary);
                    const secondary = rowSecondaryLabel(
                      row,
                      dataQuery.data?.display?.secondary,
                      identity.fields,
                    );

                    return (
                      <button
                        key={`${JSON.stringify(locator)}-${index}`}
                        type='button'
                        role={field.selection.cardinality === 'one' ? 'radio' : 'checkbox'}
                        aria-checked={selected}
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => toggleRow(row)}
                        className={cx(
                          'grid w-full gap-0.5 rounded px-2.5 py-2 text-left text-sm hover:bg-muted',
                          selected && 'bg-primary/10 text-primary',
                        )}
                      >
                        <span className='truncate font-medium'>{primary}</span>
                        {secondary && secondary !== primary ? (
                          <span className='truncate font-mono text-xs text-muted-foreground'>
                            {secondary}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                : null}
              {!dataQuery.isFetching && dataQuery.data?.rows.length === 0 ? (
                <p className='px-2.5 py-3 text-sm text-muted-foreground'>No matching entities.</p>
              ) : null}
              {dataQuery.error ? (
                <p className='px-2.5 py-3 text-sm text-destructive'>{dataQuery.error.message}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <span className='text-xs text-muted-foreground'>No identity locator reflected</span>
      )}
      {selectionKind === 'custom' ? (
        <span className='text-xs text-muted-foreground'>Custom AST</span>
      ) : null}
    </div>
  );
};
