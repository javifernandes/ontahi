'use client';

import { useReflectedEntityDataQuery } from '@ontahi/react/graph';
import { Loader2, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';

import type {
  ExplorerEntityDisplayDescriptor,
  ExplorerOperationInputRefDescriptor,
} from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import {
  getExplorerEntityRefInputFieldValue,
  updateExplorerEntityRefInputDraft,
} from './operation-executor.js';

export type ExplorerEntityRefInputVariant = 'default' | 'compact';

export type ExplorerEntityRefInputProps = {
  input: unknown;
  inputRef: ExplorerOperationInputRefDescriptor;
  locator: ExplorerOperationInputRefDescriptor['locators'][number];
  onChange: (nextInput: unknown) => void;
  variant?: ExplorerEntityRefInputVariant;
};

const toDisplayString = (value: unknown) => {
  if (value == null) {
    return '';
  }

  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value);
};

const getEntityRowDisplayValue = (row: Record<string, unknown>, fields: readonly string[] = []) =>
  fields.map(field => toDisplayString(row[field])).find(Boolean) ?? '';

const getFallbackEntityRowPrimaryLabel = (row: Record<string, unknown>) =>
  toDisplayString(row.title) ||
  toDisplayString(row.displayName) ||
  toDisplayString(row.email) ||
  toDisplayString(row.slug) ||
  toDisplayString(row.id) ||
  Object.values(row).map(toDisplayString).find(Boolean) ||
  'Untitled row';

const getEntityRowPrimaryLabel = (
  row: Record<string, unknown>,
  display?: ExplorerEntityDisplayDescriptor,
) =>
  getEntityRowDisplayValue(row, display?.primary ? [display.primary] : []) ||
  getFallbackEntityRowPrimaryLabel(row);

const getEntityRowLocatorLabel = (
  row: Record<string, unknown>,
  locator: ExplorerOperationInputRefDescriptor['locators'][number],
) =>
  locator.sourceFields
    .map(field => toDisplayString(row[field]))
    .filter(Boolean)
    .join(' · ');

const resolveLocatorValuesFromRow = (
  row: Record<string, unknown>,
  locator: ExplorerOperationInputRefDescriptor['locators'][number],
  fallbackValue: string,
) =>
  Object.fromEntries(
    locator.sourceFields.map((field, index) => [
      field,
      row[field] ?? (index === 0 ? fallbackValue : ''),
    ]),
  );

export function ExplorerEntityRefInput({
  input,
  inputRef,
  locator,
  onChange,
  variant = 'default',
}: ExplorerEntityRefInputProps) {
  const compact = variant === 'compact';
  const locatorField = locator.sourceFields[0] ?? '';
  const currentValue = getExplorerEntityRefInputFieldValue(input, inputRef, locatorField);
  const [query, setQuery] = useState(currentValue);
  const [selectedDisplay, setSelectedDisplay] = useState<{
    label: string;
    value: string;
  } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const dataQuery = useReflectedEntityDataQuery(
    {
      entityName: inputRef.entityName,
      search: deferredQuery,
      pageSize: 6,
    },
    {
      enabled: isOpen,
    },
  );
  const rows = dataQuery.data?.rows ?? [];
  const display = dataQuery.data?.display;
  const isLoading = dataQuery.isLoading || dataQuery.isFetching;
  const error = dataQuery.error?.message ?? null;

  useEffect(() => {
    if (selectedDisplay?.value === currentValue) {
      setQuery(selectedDisplay.label);
      return;
    }

    setSelectedDisplay(null);
    setQuery(currentValue);
  }, [currentValue, inputRef.path, locator.name, selectedDisplay]);

  const updateTypedValue = (value: string) => {
    setSelectedDisplay(null);
    setQuery(value);
    onChange(
      updateExplorerEntityRefInputDraft({
        input,
        inputRef,
        locatorName: locator.name,
        sourceField: locatorField,
        value,
      }),
    );
  };

  const selectRow = (row: Record<string, unknown>) => {
    const locatorValues = resolveLocatorValuesFromRow(row, locator, query);
    const nextValue = toDisplayString(locatorValues[locatorField]);
    const nextLabel = getEntityRowPrimaryLabel(row, display);

    setSelectedDisplay({
      label: nextLabel,
      value: nextValue,
    });
    setQuery(nextLabel);
    setIsOpen(false);
    onChange(
      updateExplorerEntityRefInputDraft({
        input,
        inputRef,
        locatorName: locator.name,
        sourceField: locatorField,
        value: nextValue,
        locatorValues,
      }),
    );
  };

  const selectedRefLabel =
    selectedDisplay?.value === currentValue && currentValue ? currentValue : '';

  return (
    <div>
      <div className='relative'>
        {!compact ? (
          <Search className='pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground' />
        ) : null}
        <div
          className={cx(
            'relative flex w-full items-center transition-colors',
            compact
              ? 'min-h-8 bg-transparent pr-7'
              : 'min-h-10 rounded-md border bg-background pl-9 pr-9 focus-within:border-primary',
          )}
        >
          <input
            value={query}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              globalThis.setTimeout(() => setIsOpen(false), 150);
            }}
            onChange={event => updateTypedValue(event.target.value)}
            placeholder={compact ? inputRef.path : `Search ${inputRef.entityName}`}
            className={cx(
              'min-w-0 flex-1 bg-transparent outline-none',
              compact
                ? 'text-sm font-medium text-foreground placeholder:text-foreground/80'
                : 'text-sm',
              selectedRefLabel ? 'text-transparent caret-foreground' : '',
            )}
            aria-label={`${inputRef.path} ${inputRef.entityName}`}
          />
          {selectedRefLabel ? (
            <div
              className={cx(
                'pointer-events-none absolute inset-y-0 flex items-center overflow-hidden',
                compact ? 'left-0 right-7 text-sm font-medium' : 'left-9 right-9 text-sm',
              )}
            >
              <span className='min-w-0 truncate text-foreground'>{selectedDisplay?.label}</span>
              <span className='ml-2.5 max-w-[52%] shrink-0 truncate font-mono text-xs font-normal text-muted-foreground'>
                {selectedRefLabel}
              </span>
            </div>
          ) : null}
        </div>
        {isLoading ? (
          <Loader2
            className={cx(
              'pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground',
              compact ? 'right-0' : 'right-3',
            )}
          />
        ) : null}

        {isOpen ? (
          <div className='absolute left-0 right-0 top-[calc(100%+0.375rem)] z-20 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg'>
            <div className='max-h-64 overflow-auto py-1'>
              {rows.map((row, index) => {
                const primary = getEntityRowPrimaryLabel(row, display);
                const locatorLabel = getEntityRowLocatorLabel(row, locator);
                const secondary = locatorLabel === primary ? '' : locatorLabel;

                return (
                  <button
                    key={`${primary}-${index}`}
                    type='button'
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => selectRow(row)}
                    className='grid w-full gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent'
                  >
                    <span className='truncate font-medium'>{primary}</span>
                    {secondary ? (
                      <span className='truncate font-mono text-xs text-muted-foreground'>
                        {secondary}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {!isLoading && rows.length === 0 ? (
                <div className='px-3 py-3 text-sm text-muted-foreground'>
                  {error ?? 'No rows found. You can still use the typed value.'}
                </div>
              ) : null}
            </div>
            <div className='border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground'>
              Select a row or keep the typed locator value.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
