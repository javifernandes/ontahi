'use client';

import type { AnyEntityRef, ReflectedEntityDataFilterOperator } from '@ontahi/core/data-graph';
import {
  useHasReflectedRelatedEntityDataReader,
  useReflectedRelatedEntityDataQuery,
} from '@ontahi/react/graph';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ExplorerEntityDetail } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { useExplorerRoutes } from './config.js';
import {
  type ExplorerEntityDataPageSize,
  useExplorerEntityDataBrowser,
} from './entity-data-browser.js';
import { ExplorerSelect } from './select.js';

export type ExplorerEntityDataPanelProps = {
  entity: ExplorerEntityDetail;
  showHeader?: boolean;
};

type RelatedSelection = {
  source: AnyEntityRef;
  relation: ExplorerEntityDetail['relations'][number];
};

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

const referenceLocator = (
  value: unknown,
  identity: { fields: string[] } | undefined,
): Record<string, unknown> | undefined => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'entity-ref' &&
    'locator' in value &&
    typeof value.locator === 'object' &&
    value.locator !== null
  ) {
    return value.locator as Record<string, unknown>;
  }

  return identity?.fields.length === 1 ? { [identity.fields[0]!]: value } : undefined;
};

const referenceLabel = (entityName: string, locator: Record<string, unknown>) =>
  `${entityName} · ${Object.values(locator)
    .map(value => String(value))
    .join(' · ')}`;

const rowRef = (
  entity: ExplorerEntityDetail,
  row: Record<string, unknown>,
): AnyEntityRef | undefined => {
  const fields = entity.identity?.fields;
  if (!fields?.length || fields.some(field => row[field] === undefined)) return undefined;

  return {
    kind: 'entity-ref',
    entityName: entity.name,
    locator: Object.fromEntries(
      fields.map(field => [field, row[field]]),
    ) as AnyEntityRef['locator'],
  };
};

const relatedRowLabel = (row: Record<string, unknown>, relation: RelatedSelection['relation']) => {
  const primary = relation.targetDisplay?.primary;
  if (primary && row[primary] != null) return String(row[primary]);

  const fields = relation.targetIdentity?.fields ?? [];
  return fields.length > 0
    ? fields.map(field => String(row[field] ?? '')).join(' · ')
    : JSON.stringify(row);
};

const ExplorerRelatedInstances = ({
  onClose,
  selection,
}: {
  onClose: () => void;
  selection: RelatedSelection;
}) => {
  const routes = useExplorerRoutes();
  const query = useReflectedRelatedEntityDataQuery({
    source: selection.source,
    relationName: selection.relation.name,
    sourceEntityName: selection.source.entityName,
    targetEntityName: selection.relation.target,
    page: 1,
    pageSize: 25,
  });

  return (
    <section className='rounded-lg border bg-card p-5' aria-label='Related instances'>
      <div className='flex items-center justify-between gap-3'>
        <h3 className='font-semibold text-foreground'>{selection.relation.name}</h3>
        <button
          type='button'
          onClick={onClose}
          className='text-sm text-muted-foreground hover:text-foreground'
          aria-label='Close related instances'
        >
          Close
        </button>
      </div>
      {query.error ? <p className='mt-3 text-sm text-destructive'>{query.error.message}</p> : null}
      {query.isLoading ? <p className='mt-3 text-sm text-muted-foreground'>Loading…</p> : null}
      <ul className='mt-3 grid gap-2'>
        {query.data?.rows.map((row, index) => {
          const fields = selection.relation.targetIdentity?.fields ?? [];
          const locator =
            fields.length > 0 && fields.every(field => row[field] !== undefined)
              ? Object.fromEntries(fields.map(field => [field, row[field]]))
              : undefined;
          const href = locator
            ? routes.entity(selection.relation.target, { tab: 'data', ref: locator })
            : routes.entity(selection.relation.target, { tab: 'data' });

          return (
            <li key={locator ? JSON.stringify(locator) : index}>
              <a href={href} className='text-sm text-primary hover:underline'>
                {relatedRowLabel(row, selection.relation)}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export function ExplorerEntityDataPanel({
  entity,
  showHeader = true,
}: ExplorerEntityDataPanelProps) {
  const initialRef = (() => {
    if (typeof globalThis.location === 'undefined') return undefined;
    const value = new URLSearchParams(globalThis.location.search).get('ref');
    if (!value) return undefined;

    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  })();
  const browser = useExplorerEntityDataBrowser({ entity, initialRef });
  const routes = useExplorerRoutes();
  const hasRelatedReader = useHasReflectedRelatedEntityDataReader();
  const [relatedSelection, setRelatedSelection] = useState<RelatedSelection>();
  const toManyRelations = entity.relations.filter(
    relation => relation.cardinality === 'many' && relation.provenance !== 'derived-inverse',
  );
  const showRelatedColumn = hasRelatedReader && toManyRelations.length > 0;
  const bodyColSpan = browser.columns.length + (showRelatedColumn ? 1 : 0);
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

  useEffect(() => {
    setRelatedSelection(undefined);
  }, [
    browser.filterField,
    browser.filterOperator,
    browser.filterValue,
    browser.page,
    browser.pageSize,
    browser.search,
    browser.sortDirection,
    browser.sortField,
    entity.name,
  ]);

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
                {showRelatedColumn ? (
                  <th className='whitespace-nowrap px-4 py-3 font-medium'>Related</th>
                ) : null}
              </tr>
            </thead>
            <tbody className='divide-y'>
              {browser.result?.rows.map((row, rowIndex) => {
                const source = rowRef(entity, row);

                return (
                  <tr
                    key={`${entity.name}-${browser.page}-${rowIndex}`}
                    className='hover:bg-muted/25'
                  >
                    {browser.columns.map(column => {
                      const field = entity.fields.find(
                        candidate => candidate.name === column.field,
                      );
                      const reference = field?.reference;
                      const locator = reference
                        ? referenceLocator(row[column.field], reference.identity)
                        : undefined;

                      return (
                        <td key={column.field} className='max-w-[280px] px-4 py-3 align-top'>
                          <div className='truncate font-mono text-xs text-foreground'>
                            {reference && locator ? (
                              <a
                                href={routes.entity(reference.entityName, {
                                  tab: 'data',
                                  ref: locator,
                                })}
                                className='text-primary hover:underline'
                              >
                                {referenceLabel(reference.entityName, locator)}
                              </a>
                            ) : (
                              formatCellValue(row[column.field])
                            )}
                          </div>
                        </td>
                      );
                    })}
                    {showRelatedColumn ? (
                      <td className='px-4 py-3 align-top'>
                        <div className='flex flex-wrap gap-2'>
                          {source
                            ? toManyRelations.map(relation => (
                                <button
                                  key={relation.name}
                                  type='button'
                                  onClick={() => setRelatedSelection({ source, relation })}
                                  className='rounded-md border px-2 py-1 text-xs hover:border-primary hover:text-primary'
                                >
                                  {relation.name}
                                </button>
                              ))
                            : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!browser.isLoading && browser.result?.rows.length === 0 ? (
                <tr>
                  <td colSpan={bodyColSpan} className='px-4 py-8 text-center text-muted-foreground'>
                    No rows match these filters.
                  </td>
                </tr>
              ) : null}
              {!browser.result && !browser.error ? (
                <tr>
                  <td colSpan={bodyColSpan} className='px-4 py-8 text-center text-muted-foreground'>
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
              className='min-w-[112px]'
              triggerClassName='h-9 min-h-9 px-2 pr-3'
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
      {relatedSelection ? (
        <ExplorerRelatedInstances
          selection={relatedSelection}
          onClose={() => setRelatedSelection(undefined)}
        />
      ) : null}
    </section>
  );
}
