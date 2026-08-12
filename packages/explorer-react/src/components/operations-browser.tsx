'use client';

import { useHasReflectedEntityDataReader, useReflectedOperationSupport } from '@ontahi/react/graph';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';

import type { ExplorerOperationDescriptor } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { useExplorerConfig, useExplorerRoutes } from './config.js';
import { humanizeExplorerName } from './display-name.js';
import {
  canShowExplorerOperationExecutePanel,
  ExplorerOperationDetailPanel,
  type ExplorerOperationExecutePanelRenderer as ExplorerOperationExecutePanelRendererType,
} from './operation-detail.js';
import type { ExplorerOperationRefInputRenderer } from './operation-execute-panel.js';
import { ExplorerOperationSignature } from './operation-signature.js';
import {
  explorerOperationBrowserTabs,
  getExplorerTabFromSearch,
  parseExplorerOperationBrowserTab,
  type ExplorerOperationBrowserTab,
} from './routes.js';
import { ExplorerSelect } from './select.js';

export type ExplorerOperationExecutePanelRenderer = ExplorerOperationExecutePanelRendererType;
export { explorerOperationBrowserTabs };
export type { ExplorerOperationBrowserTab };

export type ExplorerOperationsBrowserProps = {
  operations: ExplorerOperationDescriptor[];
  selectedOperationId?: string;
  selectedTab?: ExplorerOperationBrowserTab;
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  className?: string;
};

const allKindsFilter = 'all';

const getOperationSearchText = (operation: ExplorerOperationDescriptor) =>
  [
    operation.id,
    operation.name,
    humanizeExplorerName(operation.id),
    humanizeExplorerName(operation.name),
    operation.entityName,
    operation.kind,
    operation.exposure,
    operation.authority,
    operation.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const getSelectedOperationId = (
  operations: ExplorerOperationDescriptor[],
  selectedOperationId: string | undefined,
) => {
  if (selectedOperationId && operations.some(operation => operation.id === selectedOperationId)) {
    return selectedOperationId;
  }

  return operations[0]?.id ?? '';
};

const getOperationIdFromPathname = (pathname: string, basePath: string) => {
  const prefix = `${basePath}/operations/`;

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const encodedOperationId = pathname.slice(prefix.length).split('/')[0];

  return encodedOperationId ? decodeURIComponent(encodedOperationId) : undefined;
};

const getCanShowExecutePanel = ({
  hasReflectedEntityDataReader,
  supportsReflectedOperation,
  operation,
  renderExecutePanel,
  renderRefInput,
}: {
  hasReflectedEntityDataReader: boolean;
  supportsReflectedOperation: (operation: ExplorerOperationDescriptor) => boolean;
  operation?: ExplorerOperationDescriptor;
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
}) =>
  operation
    ? canShowExplorerOperationExecutePanel({
        hasReflectedEntityDataReader,
        hasReflectedOperationInvoker: supportsReflectedOperation(operation),
        operation,
        renderExecutePanel,
        renderRefInput,
      })
    : Boolean(renderExecutePanel);

const OperationBrowserTabs = ({
  activeTab,
  onTabChange,
  showExecute,
  showIngress,
}: {
  activeTab: ExplorerOperationBrowserTab;
  onTabChange: (tab: ExplorerOperationBrowserTab) => void;
  showExecute: boolean;
  showIngress: boolean;
}) => (
  <div className='flex flex-wrap gap-6 border-b px-5 pt-4'>
    {[
      ...(showExecute ? [{ id: 'execute' as const, label: 'Execute' }] : []),
      { id: 'schema' as const, label: 'Schema' },
      ...(showIngress ? [{ id: 'ingress' as const, label: 'Ingress' }] : []),
      { id: 'metadata' as const, label: 'Metadata' },
    ].map(tab => (
      <button
        key={tab.id}
        type='button'
        onClick={() => onTabChange(tab.id)}
        className={cx(
          'border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
          activeTab === tab.id
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        )}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export function ExplorerOperationsBrowser({
  operations,
  selectedOperationId,
  selectedTab,
  renderExecutePanel,
  renderRefInput,
  className,
}: ExplorerOperationsBrowserProps) {
  const { basePath } = useExplorerConfig();
  const routes = useExplorerRoutes();
  const hasReflectedEntityDataReader = useHasReflectedEntityDataReader();
  const supportsReflectedOperation = useReflectedOperationSupport();
  const initialSelectedOperation =
    operations.find(
      operation => operation.id === getSelectedOperationId(operations, selectedOperationId),
    ) ?? operations[0];
  const initialHasExecutePanel = getCanShowExecutePanel({
    hasReflectedEntityDataReader,
    supportsReflectedOperation,
    operation: initialSelectedOperation,
    renderExecutePanel,
    renderRefInput,
  });
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState(allKindsFilter);
  const [selectedId, setSelectedId] = useState(() =>
    getSelectedOperationId(operations, selectedOperationId),
  );
  const [activeTab, setActiveTab] = useState<ExplorerOperationBrowserTab>(() =>
    parseExplorerOperationBrowserTab(selectedTab, { hasExecutePanel: initialHasExecutePanel }),
  );
  const kindOptions = useMemo(
    () => [
      { value: allKindsFilter, label: 'All kinds' },
      ...Array.from(new Set(operations.map(operation => operation.kind)))
        .sort()
        .map(option => ({ value: option, label: option })),
    ],
    [operations],
  );
  const filteredOperations = useMemo(
    () =>
      operations.filter(operation => {
        const matchesKind = kind === allKindsFilter || operation.kind === kind;

        return matchesKind && getOperationSearchText(operation).includes(query.toLowerCase());
      }),
    [kind, operations, query],
  );
  const selectedOperation =
    operations.find(operation => operation.id === selectedId) ??
    filteredOperations[0] ??
    operations[0];
  const hasExecutePanel = getCanShowExecutePanel({
    hasReflectedEntityDataReader,
    supportsReflectedOperation,
    operation: selectedOperation,
    renderExecutePanel,
    renderRefInput,
  });
  const showIngress = Boolean(selectedOperation?.ingressRoutes?.length) || activeTab === 'ingress';

  useEffect(() => {
    setSelectedId(currentSelectedId => {
      const nextSelectedId =
        selectedOperationId && operations.some(operation => operation.id === selectedOperationId)
          ? selectedOperationId
          : operations.some(operation => operation.id === currentSelectedId)
            ? currentSelectedId
            : (operations[0]?.id ?? '');
      const nextSelectedOperation =
        operations.find(operation => operation.id === nextSelectedId) ?? operations[0];
      const nextHasExecutePanel = getCanShowExecutePanel({
        hasReflectedEntityDataReader,
        supportsReflectedOperation,
        operation: nextSelectedOperation,
        renderExecutePanel,
        renderRefInput,
      });

      setActiveTab(
        parseExplorerOperationBrowserTab(selectedTab, { hasExecutePanel: nextHasExecutePanel }),
      );
      return nextSelectedId;
    });
  }, [
    hasReflectedEntityDataReader,
    supportsReflectedOperation,
    operations,
    renderExecutePanel,
    renderRefInput,
    selectedOperationId,
    selectedTab,
  ]);

  useEffect(() => {
    const handlePopState = () => {
      const operationId = getOperationIdFromPathname(globalThis.location.pathname, basePath);

      if (operationId && operations.some(operation => operation.id === operationId)) {
        setSelectedId(operationId);
      }

      const nextSelectedOperation = operationId
        ? (operations.find(operation => operation.id === operationId) ?? selectedOperation)
        : selectedOperation;
      const nextHasExecutePanel = getCanShowExecutePanel({
        hasReflectedEntityDataReader,
        supportsReflectedOperation,
        operation: nextSelectedOperation,
        renderExecutePanel,
        renderRefInput,
      });

      setActiveTab(
        parseExplorerOperationBrowserTab(getExplorerTabFromSearch(globalThis.location.search), {
          hasExecutePanel: nextHasExecutePanel,
        }),
      );
    };

    globalThis.addEventListener('popstate', handlePopState);

    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [
    basePath,
    hasReflectedEntityDataReader,
    supportsReflectedOperation,
    operations,
    renderExecutePanel,
    renderRefInput,
    selectedOperation,
  ]);

  const selectOperation = (clickEvent: MouseEvent<HTMLAnchorElement>, operationId: string) => {
    if (
      clickEvent.defaultPrevented ||
      clickEvent.metaKey ||
      clickEvent.ctrlKey ||
      clickEvent.shiftKey ||
      clickEvent.altKey ||
      clickEvent.button !== 0
    ) {
      return;
    }

    clickEvent.preventDefault();
    const nextOperation = operations.find(operation => operation.id === operationId);
    const nextHasExecutePanel = getCanShowExecutePanel({
      hasReflectedEntityDataReader,
      supportsReflectedOperation,
      operation: nextOperation,
      renderExecutePanel,
      renderRefInput,
    });

    setSelectedId(operationId);
    setActiveTab(
      parseExplorerOperationBrowserTab(undefined, { hasExecutePanel: nextHasExecutePanel }),
    );
    globalThis.history.pushState(null, '', routes.operation(operationId));
  };

  const selectTab = (nextTab: ExplorerOperationBrowserTab) => {
    if (!selectedOperation) {
      return;
    }

    setActiveTab(nextTab);
    globalThis.history.pushState(
      null,
      '',
      routes.operation(selectedOperation.id, { tab: nextTab }),
    );
  };

  return (
    <div className={cx('grid gap-6', className)}>
      <header>
        <h1 className='text-3xl font-semibold tracking-tight'>Operation Catalog</h1>
        <p className='mt-2 max-w-3xl text-sm text-muted-foreground'>
          Inspect graph, domain, and durable operations exposed by the graph runtime.
        </p>
      </header>

      <div className='grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]'>
        <aside className='grid min-h-0 gap-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:grid-rows-[auto_auto_minmax(0,1fr)]'>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder='Search operations'
            aria-label='Search operations'
            className='min-h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary'
          />
          <ExplorerSelect
            value={kind}
            onValueChange={setKind}
            options={kindOptions}
            aria-label='Filter operations by kind'
          />
          <div className='min-h-0 overflow-y-auto rounded-lg border bg-card'>
            {filteredOperations.map(operation => (
              <a
                key={operation.id}
                href={routes.operation(operation.id)}
                onClick={clickEvent => selectOperation(clickEvent, operation.id)}
                className={cx(
                  'grid w-full gap-1 border-b px-4 py-3 text-left last:border-0 hover:bg-accent/70',
                  selectedOperation?.id === operation.id && 'bg-primary/10',
                )}
              >
                <span className='text-sm font-semibold text-foreground'>
                  {humanizeExplorerName(operation.name)}
                </span>
                <ExplorerOperationSignature operation={operation} variant='stacked' />
                <span className='text-xs text-muted-foreground'>
                  {operation.kind} · {operation.exposure}
                </span>
              </a>
            ))}
            {filteredOperations.length === 0 ? (
              <p className='px-4 py-8 text-sm text-muted-foreground'>No operations match.</p>
            ) : null}
          </div>
        </aside>

        {selectedOperation ? (
          <section className='min-w-0 grid content-start gap-5'>
            <div className='rounded-lg border bg-card p-5'>
              <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                <div>
                  <a
                    href={routes.entity(selectedOperation.entityName)}
                    className='text-sm font-medium text-primary hover:underline'
                  >
                    {selectedOperation.entityName}
                  </a>
                  <h2 className='text-xl font-semibold tracking-tight text-foreground'>
                    {humanizeExplorerName(selectedOperation.name)}
                  </h2>
                  <div className='mt-2'>
                    <ExplorerOperationSignature operation={selectedOperation} />
                  </div>
                  {selectedOperation.description ? (
                    <p className='mt-2 max-w-2xl text-sm text-muted-foreground'>
                      {selectedOperation.description}
                    </p>
                  ) : null}
                </div>
                <div className='flex flex-wrap gap-2'>
                  <span className='rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground'>
                    {selectedOperation.kind}
                  </span>
                  <span className='rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground'>
                    {selectedOperation.exposure}
                  </span>
                </div>
              </div>
            </div>

            <section className='overflow-hidden rounded-lg border bg-card'>
              <OperationBrowserTabs
                activeTab={activeTab}
                onTabChange={selectTab}
                showExecute={hasExecutePanel}
                showIngress={showIngress}
              />
              <div className='p-5'>
                <ExplorerOperationDetailPanel
                  operation={selectedOperation}
                  activeTab={activeTab}
                  executeVariant='compact'
                  renderExecutePanel={renderExecutePanel}
                  renderRefInput={renderRefInput}
                />
              </div>
            </section>
          </section>
        ) : null}
      </div>
    </div>
  );
}
