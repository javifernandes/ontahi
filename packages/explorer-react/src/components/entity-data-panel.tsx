'use client';

import type { AnyEntityRef, ReflectedEntityDataFilterOperator } from '@ontahi/core/data-graph';
import { useGraphExecutorCapability } from '@ontahi/react/graph';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';

import type { ExplorerEntityDetail } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { useExplorerRoutes } from './config.js';
import {
  type ExplorerEntityDataPageSize,
  useExplorerEntityDataBrowser,
} from './entity-data-browser.js';
import {
  ExplorerEditableEntityCell,
  ExplorerEntityCreateButton,
  ExplorerEntityDeleteButton,
  type ExplorerEntityMutationRunner,
} from './entity-data-mutations.js';
import {
  formatExplorerEntityValue,
  getExplorerReferenceLocator,
  getExplorerRowRef,
} from './entity-instance-values.js';
import {
  ExplorerEntityInstanceWorkspaceProvider,
  explorerInstanceWindowKey,
  useExplorerEntityInstanceWorkspace,
} from './entity-instance-workspace.js';
import { ExplorerEntityReferenceValue } from './entity-reference-value.js';
import { shouldHandleExplorerNavigation } from './routes.js';
import { ExplorerSelect } from './select.js';

export type ExplorerEntityDataPanelProps = {
  entity: ExplorerEntityDetail;
  showHeader?: boolean;
};

const isInteractiveRowTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('a, button, input, select, textarea'));

function ExplorerEntityDataPanelContent({
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
  const graphExecutor = useGraphExecutorCapability();
  const instanceWorkspace = useExplorerEntityInstanceWorkspace();
  const runMutation: ExplorerEntityMutationRunner | undefined =
    graphExecutor?.runEntityMutationCommand
      ? command => graphExecutor.runEntityMutationCommand!(command)
      : undefined;
  const canDelete = Boolean(runMutation && entity.mutations?.delete);
  const canCreate = Boolean(runMutation && entity.mutations?.create);
  const bodyColSpan = browser.columns.length + (canDelete ? 1 : 0);
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
          {showHeader || (canCreate && runMutation) ? (
            <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
              {showHeader ? (
                <div>
                  <h3 className='font-semibold text-foreground'>Data</h3>
                </div>
              ) : null}
              {canCreate && runMutation ? (
                <ExplorerEntityCreateButton
                  entity={entity}
                  runMutation={runMutation}
                  onApplied={browser.refresh}
                />
              ) : null}
            </div>
          ) : null}

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
                {canDelete ? (
                  <th className='whitespace-nowrap px-4 py-3 font-medium'>Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className='divide-y'>
              {browser.result?.rows.map((row, rowIndex) => {
                const source = getExplorerRowRef(entity, row);
                const rowKey = source ? JSON.stringify(source.locator) : String(rowIndex);
                const windowKey = source ? explorerInstanceWindowKey(source) : undefined;
                const selected = windowKey === instanceWorkspace?.activeKey;
                const selectInstance = (
                  event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>,
                ) => {
                  if (!source || isInteractiveRowTarget(event.target)) return;
                  if ('key' in event && !['Enter', ' '].includes(event.key)) return;
                  if ('key' in event) event.preventDefault();
                  instanceWorkspace?.open({ entity, row, source });
                };

                return (
                  <tr
                    key={`${entity.name}-${browser.page}-${rowKey}`}
                    tabIndex={source ? 0 : undefined}
                    onClick={selectInstance}
                    onKeyDown={selectInstance}
                    className={cx(
                      source &&
                        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30',
                      selected ? 'bg-primary/10' : 'hover:bg-muted/25',
                    )}
                  >
                    {browser.columns.map(column => {
                      const field = entity.fields.find(
                        candidate => candidate.name === column.field,
                      );
                      const reference = field?.reference;
                      const locator = reference
                        ? getExplorerReferenceLocator(row[column.field], reference.identity)
                        : undefined;
                      const editable = Boolean(
                        source &&
                        runMutation &&
                        field &&
                        !field.derived &&
                        !entity.identity?.fields.includes(field.name) &&
                        entity.mutations?.update?.fields.includes(field.name),
                      );
                      const referenceHref =
                        reference && locator
                          ? routes.entity(reference.entityName, {
                              tab: 'data',
                              ref: locator,
                            })
                          : undefined;
                      const referenceSource =
                        reference && locator
                          ? ({
                              kind: 'entity-ref',
                              entityName: reference.entityName,
                              locator: locator as AnyEntityRef['locator'],
                            } satisfies AnyEntityRef)
                          : undefined;
                      const navigateReference = (event: MouseEvent<HTMLAnchorElement>) => {
                        if (
                          !referenceHref ||
                          !referenceSource ||
                          !instanceWorkspace ||
                          !shouldHandleExplorerNavigation(event)
                        ) {
                          return;
                        }

                        event.preventDefault();
                        instanceWorkspace.navigate({
                          href: referenceHref,
                          source: referenceSource,
                        });
                      };
                      const cell =
                        reference && locator ? (
                          editable ? (
                            <ExplorerEntityReferenceValue locator={locator} reference={reference} />
                          ) : (
                            <a
                              href={referenceHref}
                              onClick={navigateReference}
                              className='text-primary hover:underline'
                            >
                              <ExplorerEntityReferenceValue
                                locator={locator}
                                reference={reference}
                              />
                            </a>
                          )
                        ) : (
                          formatExplorerEntityValue(row[column.field])
                        );

                      return (
                        <td key={column.field} className='max-w-[280px] px-4 py-3 align-top'>
                          <div
                            className={cx(
                              'font-mono text-xs text-foreground',
                              editable ? 'overflow-visible' : 'truncate',
                            )}
                          >
                            {editable && source && runMutation && field ? (
                              <ExplorerEditableEntityCell
                                entityName={entity.name}
                                field={field}
                                href={referenceHref}
                                onNavigate={navigateReference}
                                value={row[column.field]}
                                target={source}
                                runMutation={runMutation}
                                onApplied={browser.refresh}
                              >
                                {cell}
                              </ExplorerEditableEntityCell>
                            ) : (
                              cell
                            )}
                          </div>
                        </td>
                      );
                    })}
                    {canDelete ? (
                      <td className='px-4 py-3 align-top'>
                        {source && runMutation ? (
                          <ExplorerEntityDeleteButton
                            entityName={entity.name}
                            target={source}
                            runMutation={runMutation}
                            onApplied={browser.refresh}
                          />
                        ) : null}
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
    </section>
  );
}

export function ExplorerEntityDataPanel(props: ExplorerEntityDataPanelProps) {
  const workspace = useExplorerEntityInstanceWorkspace();

  return workspace ? (
    <ExplorerEntityDataPanelContent {...props} />
  ) : (
    <ExplorerEntityInstanceWorkspaceProvider entities={[props.entity]}>
      <ExplorerEntityDataPanelContent {...props} />
    </ExplorerEntityInstanceWorkspaceProvider>
  );
}
