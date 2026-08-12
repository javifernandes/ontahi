'use client';

import { useHasReflectedEntityDataReader } from '@ontahi/react/graph';
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';

import type {
  ExplorerEntityDetail,
  ExplorerOperationDescriptor,
  ExplorerTaskDescriptor,
} from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { useExplorerConfig, useExplorerRoutes } from './config.js';
import { ExplorerEntityDataPanel } from './entity-data-panel.js';
import {
  ExplorerEntityStructurePanel,
  type ExplorerEntityStructurePanelProps,
} from './entity-detail-panels.js';
import { ExplorerEntityOperationsPanel } from './entity-operations-panel.js';
import type { ExplorerOperationExecutePanelRenderer } from './operation-detail.js';
import type { ExplorerOperationRefInputRenderer } from './operation-execute-panel.js';
import {
  explorerEntityBrowserTabs,
  getExplorerTabFromSearch,
  parseExplorerEntityBrowserTab,
  type ExplorerEntityBrowserTab,
} from './routes.js';

export { explorerEntityBrowserTabs };
export type { ExplorerEntityBrowserTab };

export type ExplorerEntityDataPanelRenderer = (props: {
  entity: ExplorerEntityDetail;
}) => ReactNode;

export type ExplorerEntityBrowserProps = {
  entities: ExplorerEntityDetail[];
  operations: ExplorerOperationDescriptor[];
  tasks: ExplorerTaskDescriptor[];
  selectedEntityName?: string;
  selectedTab?: ExplorerEntityBrowserTab;
  renderDataPanel?: ExplorerEntityDataPanelRenderer;
  renderDiagram?: ExplorerEntityStructurePanelProps['renderDiagram'];
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  className?: string;
};

const getSelectedEntityName = (
  entities: ExplorerEntityDetail[],
  selectedEntityName: string | undefined,
) => {
  if (selectedEntityName && entities.some(entity => entity.name === selectedEntityName)) {
    return selectedEntityName;
  }

  return entities[0]?.name ?? '';
};

const getEntityNameFromPathname = (pathname: string, basePath: string) => {
  const prefix = `${basePath}/entities/`;

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const encodedEntityName = pathname.slice(prefix.length).split('/')[0];

  return encodedEntityName ? decodeURIComponent(encodedEntityName) : undefined;
};

const describeEntityStructureSummary = (entity: ExplorerEntityDetail) =>
  entity.relationOwner
    ? `Relation owner for ${entity.relationOwner.source}.${entity.relationOwner.name}`
    : `${entity.fieldCount} fields, ${entity.relationCount} relations`;

const describeEntityDetailSummary = (
  entity: ExplorerEntityDetail,
  operations: ExplorerOperationDescriptor[],
  tasks: ExplorerTaskDescriptor[],
) =>
  `${describeEntityStructureSummary(entity)}, ${operations.length} operations, ${tasks.length} tasks`;

const getEntitySearchText = (entity: ExplorerEntityDetail) =>
  [
    entity.name,
    entity.exposure,
    entity.relationOwner?.source,
    entity.relationOwner?.name,
    entity.relationOwner?.target,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const EntityBrowserDetail = ({
  entity,
  operations,
  renderDataPanel,
  renderDiagram,
  renderExecutePanel,
  renderRefInput,
  tab,
  tasks,
  onTabChange,
}: {
  entity: ExplorerEntityDetail;
  operations: ExplorerOperationDescriptor[];
  renderDataPanel?: ExplorerEntityDataPanelRenderer;
  renderDiagram?: ExplorerEntityStructurePanelProps['renderDiagram'];
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  tab: ExplorerEntityBrowserTab;
  tasks: ExplorerTaskDescriptor[];
  onTabChange: (tab: ExplorerEntityBrowserTab) => void;
}) => {
  const canShowData = Boolean(renderDataPanel && !entity.relationOwner);
  const effectiveTab = parseExplorerEntityBrowserTab(tab, { canShowData });

  return (
    <section className='grid content-start gap-5'>
      <div className='rounded-lg border bg-card px-5 py-3'>
        <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
          <h2 className='font-mono text-xl font-semibold tracking-tight text-foreground'>
            {entity.name}
          </h2>
          <div className='flex flex-wrap items-center gap-3 md:justify-end'>
            <p className='text-sm text-muted-foreground'>
              {describeEntityDetailSummary(entity, operations, tasks)}
            </p>
            {entity.exposure ? (
              <span className='rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground'>
                {entity.exposure}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className='flex gap-2 border-b'>
        {[
          { id: 'structure' as const, label: 'Schema' },
          { id: 'operations' as const, label: 'Operations' },
          ...(canShowData ? [{ id: 'data' as const, label: 'Data' }] : []),
        ].map(tabOption => (
          <button
            key={tabOption.id}
            type='button'
            onClick={() => onTabChange(tabOption.id)}
            className={cx(
              'px-3 py-2 text-sm font-medium capitalize text-muted-foreground hover:text-foreground',
              effectiveTab === tabOption.id && 'border-b-2 border-primary text-primary',
            )}
          >
            {tabOption.label}
          </button>
        ))}
      </div>
      {effectiveTab === 'structure' ? (
        <ExplorerEntityStructurePanel entity={entity} renderDiagram={renderDiagram} />
      ) : null}
      {effectiveTab === 'operations' ? (
        <ExplorerEntityOperationsPanel
          operations={operations}
          tasks={tasks}
          embedded
          renderExecutePanel={renderExecutePanel}
          renderRefInput={renderRefInput}
        />
      ) : null}
      {effectiveTab === 'data' && renderDataPanel ? renderDataPanel({ entity }) : null}
    </section>
  );
};

export function ExplorerEntityBrowser({
  className,
  entities,
  operations,
  renderDataPanel,
  renderDiagram,
  renderExecutePanel,
  renderRefInput,
  selectedEntityName,
  selectedTab,
  tasks,
}: ExplorerEntityBrowserProps) {
  const { basePath } = useExplorerConfig();
  const routes = useExplorerRoutes();
  const hasReflectedEntityDataReader = useHasReflectedEntityDataReader();
  const resolvedRenderDataPanel =
    renderDataPanel ??
    (hasReflectedEntityDataReader
      ? ({ entity }) => <ExplorerEntityDataPanel entity={entity} showHeader={false} />
      : undefined);
  const canShowDataTab = Boolean(resolvedRenderDataPanel);
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState(() =>
    getSelectedEntityName(entities, selectedEntityName),
  );
  const [tab, setTab] = useState<ExplorerEntityBrowserTab>(() =>
    parseExplorerEntityBrowserTab(selectedTab, { canShowData: canShowDataTab }),
  );
  const filteredEntities = useMemo(
    () =>
      entities.filter(entity => getEntitySearchText(entity).includes(query.toLowerCase().trim())),
    [entities, query],
  );
  const selectedEntity =
    entities.find(entity => entity.name === selectedName) ?? filteredEntities[0] ?? entities[0];
  const selectedOperations = selectedEntity
    ? operations.filter(operation => operation.entityName === selectedEntity.name)
    : [];
  const selectedTasks = selectedEntity
    ? tasks.filter(task => task.entityName === selectedEntity.name)
    : [];

  useEffect(() => {
    setSelectedName(currentSelectedName => {
      if (selectedEntityName && entities.some(entity => entity.name === selectedEntityName)) {
        return selectedEntityName;
      }

      if (entities.some(entity => entity.name === currentSelectedName)) {
        return currentSelectedName;
      }

      return entities[0]?.name ?? '';
    });
    setTab(parseExplorerEntityBrowserTab(selectedTab, { canShowData: canShowDataTab }));
  }, [canShowDataTab, entities, selectedEntityName, selectedTab]);

  useEffect(() => {
    const handlePopState = () => {
      const entityName = getEntityNameFromPathname(globalThis.location.pathname, basePath);

      if (entityName && entities.some(entity => entity.name === entityName)) {
        setSelectedName(entityName);
      }

      setTab(
        parseExplorerEntityBrowserTab(getExplorerTabFromSearch(globalThis.location.search), {
          canShowData: canShowDataTab,
        }),
      );
    };

    globalThis.addEventListener('popstate', handlePopState);

    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [basePath, canShowDataTab, entities]);

  const selectEntity = (clickEvent: MouseEvent<HTMLAnchorElement>, entityName: string) => {
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
    setSelectedName(entityName);
    setTab('structure');
    globalThis.history.pushState(null, '', routes.entity(entityName));
  };
  const selectTab = (nextTab: ExplorerEntityBrowserTab) => {
    if (!selectedEntity) {
      return;
    }

    setTab(nextTab);
    globalThis.history.pushState(null, '', routes.entity(selectedEntity.name, { tab: nextTab }));
  };

  return (
    <div className={cx('grid gap-6', className)}>
      <header>
        <h1 className='text-3xl font-semibold tracking-tight'>Entity Browser</h1>
        <p className='mt-2 max-w-3xl text-sm text-muted-foreground'>
          Inspect entity structure, relationships, operations, tasks, and eventually read-only
          persisted data.
        </p>
      </header>
      <div className='grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]'>
        <aside className='grid content-start gap-3'>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder='Search entities'
            aria-label='Search entities'
            className='min-h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary'
          />
          <div className='overflow-hidden rounded-lg border bg-card'>
            {filteredEntities.map(entity => (
              <a
                key={entity.name}
                href={routes.entity(entity.name)}
                onClick={clickEvent => selectEntity(clickEvent, entity.name)}
                className={cx(
                  'grid w-full gap-1 border-b px-4 py-3 text-left last:border-0 hover:bg-accent/70',
                  selectedEntity?.name === entity.name && 'bg-primary/10',
                )}
              >
                <span className='font-mono text-sm font-semibold text-foreground'>
                  {entity.name}
                </span>
                <span className='text-xs text-muted-foreground'>
                  {entity.relationOwner
                    ? `${entity.relationOwner.source}.${entity.relationOwner.name} relation`
                    : `${entity.fieldCount} fields · ${entity.relationCount} relations`}{' '}
                  · {entity.graphOperationCount + entity.domainOperationCount} operations
                </span>
              </a>
            ))}
            {filteredEntities.length === 0 ? (
              <p className='px-4 py-8 text-sm text-muted-foreground'>No entities match.</p>
            ) : null}
          </div>
        </aside>
        {selectedEntity ? (
          <EntityBrowserDetail
            entity={selectedEntity}
            operations={selectedOperations}
            renderDataPanel={resolvedRenderDataPanel}
            renderDiagram={renderDiagram}
            renderExecutePanel={renderExecutePanel}
            renderRefInput={renderRefInput}
            tab={tab}
            tasks={selectedTasks}
            onTabChange={selectTab}
          />
        ) : null}
      </div>
    </div>
  );
}
