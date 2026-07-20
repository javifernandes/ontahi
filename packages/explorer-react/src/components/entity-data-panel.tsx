'use client';

import type { ReflectedEntityDataFilterOperator } from '@ontahi/core/data-graph';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';

import type { ExplorerEntityDetail } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import {
  type ExplorerEntityDataPageSize,
  useExplorerEntityDataBrowser,
} from './entity-data-browser.js';

export type ExplorerEntityDataPanelProps = {
  entity: ExplorerEntityDetail;
  showHeader?: boolean;
};

type ExplorerSelectProps = {
  value: string;
  options: Array<{
    value: string;
    label: string;
  }>;
  onValueChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
};

const ExplorerSelect = ({
  'aria-label': ariaLabel,
  className,
  onValueChange,
  options,
  value,
}: ExplorerSelectProps) => (
  <select
    aria-label={ariaLabel}
    value={value}
    onChange={event => onValueChange(event.target.value)}
    className={cx(
      'min-h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary',
      className,
    )}
  >
    {options.map(option => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

const formatCellValue = (value: unknown) => {
  if (value == null) {
    return <span className='text-muted-foreground'>null</span>;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

export function ExplorerEntityDataPanel({
  entity,
  showHeader = true,
}: ExplorerEntityDataPanelProps) {
  const browser = useExplorerEntityDataBrowser({ entity });
  const fieldOptions = entity.fields.map(field => ({ value: field.name, label: field.name }));
  const operatorOptions = browser.availableFilterOperators.map(operator => ({
    value: operator.value,
    label: operator.label,
  }));
  const sortFieldOptions = entity.fields.map(field => ({
    value: field.name,
    label: `sort ${field.name}`,
  }));
  const sortDirectionOptions = [
    { value: 'desc', label: 'desc' },
    { value: 'asc', label: 'asc' },
  ];
  const pageSizeOptions = browser.pageSizeOptions.map(option => ({
    value: String(option),
    label: `${option} / page`,
  }));

  return (
    <section className='grid content-start gap-4'>
      <div className='rounded-lg border bg-card p-5'>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            {showHeader ? (
              <div>
                <h3 className='font-semibold text-foreground'>Data</h3>
                <p className='mt-1 text-sm text-muted-foreground'>
                  Read-only rows from the graph runtime reflection.
                </p>
              </div>
            ) : (
              <div />
            )}
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <RefreshCw
                className={cx('size-4', browser.isLoading && 'animate-spin text-primary')}
              />
              {browser.result ? `${browser.result.totalCount} rows` : 'Loading rows'}
            </div>
          </div>

          <div className='grid gap-3 xl:grid-cols-[minmax(220px,1fr)_minmax(360px,1.5fr)_minmax(260px,0.9fr)]'>
            <label className='relative block'>
              <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <input
                value={browser.search}
                onChange={event => browser.setSearch(event.target.value)}
                placeholder='Search scalar fields'
                className='min-h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary'
              />
            </label>

            <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)]'>
              <ExplorerSelect
                value={browser.filterField}
                onValueChange={browser.setFilterField}
                options={fieldOptions}
              />
              <ExplorerSelect
                value={browser.filterOperator}
                onValueChange={value =>
                  browser.setFilterOperator(value as ReflectedEntityDataFilterOperator)
                }
                options={operatorOptions}
              />
              <input
                value={browser.filterValue}
                onChange={event => browser.setFilterValue(event.target.value)}
                disabled={browser.filterOperator === 'isNull'}
                placeholder={
                  browser.filterOperator === 'isNull' ? 'No value needed' : 'Filter value'
                }
                className='min-h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:bg-muted/40'
              />
            </div>

            <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_96px]'>
              <ExplorerSelect
                value={browser.sortField}
                onValueChange={browser.setSortField}
                options={sortFieldOptions}
              />
              <ExplorerSelect
                value={browser.sortDirection}
                onValueChange={value => browser.setSortDirection(value as 'asc' | 'desc')}
                options={sortDirectionOptions}
              />
            </div>
          </div>
        </div>
      </div>

      {browser.result?.omittedColumns?.length ? (
        <div className='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950'>
          <div className='font-medium'>Some mapped fields are not queryable in this table.</div>
          <div className='mt-1 text-amber-900'>
            {browser.result.omittedColumns
              .map(column => `${column.field} (${column.column})`)
              .join(', ')}
          </div>
        </div>
      ) : null}

      <div className='overflow-hidden rounded-lg border bg-card'>
        {browser.error ? <div className='p-5 text-sm text-destructive'>{browser.error}</div> : null}
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[760px] text-left text-sm'>
            <thead className='border-b bg-muted/35 text-xs uppercase tracking-wide text-muted-foreground'>
              <tr>
                {browser.columns.map(column => (
                  <th key={column.field} className='whitespace-nowrap px-4 py-3 font-medium'>
                    <div className='grid gap-1'>
                      <span className='font-mono text-foreground'>{column.field}</span>
                      <span className='font-mono normal-case text-muted-foreground'>
                        {column.type}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y'>
              {browser.result?.rows.map((row, rowIndex) => (
                <tr
                  key={`${entity.name}-${browser.page}-${rowIndex}`}
                  className='hover:bg-muted/25'
                >
                  {browser.columns.map(column => (
                    <td key={column.field} className='max-w-[280px] px-4 py-3 align-top'>
                      <div className='truncate font-mono text-xs text-foreground'>
                        {formatCellValue(row[column.field])}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              {!browser.isLoading && browser.result?.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={browser.columns.length}
                    className='px-4 py-8 text-center text-muted-foreground'
                  >
                    No rows match these filters.
                  </td>
                </tr>
              ) : null}
              {!browser.result && !browser.error ? (
                <tr>
                  <td
                    colSpan={browser.columns.length}
                    className='px-4 py-8 text-center text-muted-foreground'
                  >
                    Loading rows...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className='flex flex-col gap-3 border-t px-4 py-3 text-sm md:flex-row md:items-center md:justify-between'>
          <div className='text-muted-foreground'>
            Page {browser.page} of {browser.totalPages}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <ExplorerSelect
              value={String(browser.pageSize)}
              onValueChange={value =>
                browser.setPageSize(Number(value) as ExplorerEntityDataPageSize)
              }
              options={pageSizeOptions}
              className='h-9 min-h-9 min-w-[112px] px-2 pr-3'
            />
            <button
              type='button'
              onClick={browser.goToPreviousPage}
              disabled={!browser.result?.hasPreviousPage || browser.isLoading}
              className='inline-flex size-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45'
              aria-label='Previous page'
            >
              <ChevronLeft className='size-4' />
            </button>
            <button
              type='button'
              onClick={browser.goToNextPage}
              disabled={!browser.result?.hasNextPage || browser.isLoading}
              className='inline-flex size-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45'
              aria-label='Next page'
            >
              <ChevronRight className='size-4' />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
