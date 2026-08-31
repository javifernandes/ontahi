'use client';

import { useHasReflectedEntityDataReader } from '@ontahi/react/graph';
import { Boxes, Braces, Check, ChevronsUpDown, Network, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';

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
import { ExplorerEntityInstanceWorkspaceProvider } from './entity-instance-workspace.js';
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

const EntityPicker = ({
  entities,
  selectedEntity,
  onSelect,
}: {
  entities: ExplorerEntityDetail[];
  selectedEntity: ExplorerEntityDetail;
  onSelect: (event: MouseEvent<HTMLAnchorElement>, entityName: string) => void;
}) => {
  const routes = useExplorerRoutes();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filteredEntities = useMemo(
    () =>
      entities.filter(entity => getEntitySearchText(entity).includes(query.toLowerCase().trim())),
    [entities, query],
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className='relative min-w-0 flex-1'>
      <button
        type='button'
        role='combobox'
        aria-expanded={open}
        aria-haspopup='listbox'
        aria-label={`Select entity, ${selectedEntity.name}`}
        onClick={() => setOpen(current => !current)}
        className='group flex w-full max-w-sm items-center gap-3 rounded-2xl border bg-card/95 px-3 py-2 text-left shadow-lg backdrop-blur transition hover:border-primary/50 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20'
      >
        <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground'>
          <Boxes className='size-5' />
        </span>
        <span className='grid min-w-0 flex-1'>
          <span className='truncate font-mono text-base font-semibold text-foreground'>
            {selectedEntity.name}
          </span>
        </span>
        <ChevronsUpDown className='size-4 shrink-0 text-muted-foreground transition group-hover:text-foreground' />
      </button>

      {open ? (
        <div className='absolute left-0 top-[calc(100%+0.5rem)] z-50 w-full max-w-xl overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl'>
          <label className='relative block border-b p-2'>
            <Search className='pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder='Find an entity…'
              aria-label='Search entities'
              className='min-h-10 w-full rounded-xl bg-muted/50 pl-10 pr-3 text-sm outline-none focus:bg-background'
            />
          </label>
          <div role='listbox' aria-label='Entities' className='max-h-80 overflow-y-auto p-2'>
            {filteredEntities.map(entity => {
              const selected = entity.name === selectedEntity.name;

              return (
                <a
                  key={entity.name}
                  href={routes.entity(entity.name)}
                  role='option'
                  aria-selected={selected}
                  onClick={event => {
                    onSelect(event, entity.name);
                    setOpen(false);
                    setQuery('');
                  }}
                  className='flex items-center gap-3 rounded-xl px-3 py-2.5 text-left no-underline transition hover:bg-accent'
                >
                  <span className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-xs font-semibold text-muted-foreground'>
                    {entity.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className='grid min-w-0 flex-1 gap-0.5'>
                    <span className='truncate font-mono text-sm font-semibold text-foreground'>
                      {entity.name}
                    </span>
                  </span>
                  {selected ? <Check className='size-4 shrink-0 text-primary' /> : null}
                </a>
              );
            })}
            {filteredEntities.length === 0 ? (
              <p className='px-3 py-8 text-center text-sm text-muted-foreground'>
                No entities match.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const EntityBrowserDetail = ({
  entity,
  entityPicker,
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
  entityPicker: ReactNode;
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
    <section className='relative min-h-[calc(100vh-9rem)]'>
      <div className='pointer-events-none absolute inset-x-4 top-4 z-40 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
        <div className='pointer-events-auto min-w-0 flex-1'>{entityPicker}</div>
        <div className='pointer-events-auto flex shrink-0 flex-wrap items-center gap-2'>
          {canShowData && effectiveTab !== 'data' ? (
            <button
              type='button'
              onClick={() => onTabChange('data')}
              className='rounded-xl border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:border-primary hover:text-primary'
            >
              Instances
            </button>
          ) : null}
          {operations.length > 0 || tasks.length > 0 ? (
            <button
              type='button'
              onClick={() => onTabChange('operations')}
              aria-pressed={effectiveTab === 'operations'}
              className={cx(
                'inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:border-primary hover:text-primary',
                effectiveTab === 'operations' && 'border-primary text-primary',
              )}
            >
              <Braces className='size-4' />
              Actions
            </button>
          ) : null}
        </div>
      </div>
      <div className='pt-32 md:pt-24'>
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
      </div>
      {effectiveTab !== 'structure' ? (
        <div className='sticky bottom-6 ml-auto pt-2'>
          <button
            type='button'
            onClick={() => onTabChange('structure')}
            className='inline-flex items-center gap-2 rounded-full border bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg hover:bg-foreground/90'
          >
            <Network className='size-4' />
            Schema
          </button>
        </div>
      ) : null}
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
  const [selectedName, setSelectedName] = useState(() =>
    getSelectedEntityName(entities, selectedEntityName),
  );
  const [tab, setTab] = useState<ExplorerEntityBrowserTab>(() =>
    parseExplorerEntityBrowserTab(selectedTab, { canShowData: canShowDataTab }),
  );
  const selectedEntity = entities.find(entity => entity.name === selectedName) ?? entities[0];
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
    setTab(parseExplorerEntityBrowserTab(undefined, { canShowData: canShowDataTab }));
    globalThis.history.pushState(null, '', routes.entity(entityName));
  };
  const selectTab = (nextTab: ExplorerEntityBrowserTab) => {
    if (!selectedEntity) {
      return;
    }

    setTab(nextTab);
    globalThis.history.pushState(null, '', routes.entity(selectedEntity.name, { tab: nextTab }));
  };

  const browser = (
    <div className={cx('grid gap-6', className)}>
      {selectedEntity ? (
        <EntityBrowserDetail
          entity={selectedEntity}
          entityPicker={
            <EntityPicker
              entities={entities}
              selectedEntity={selectedEntity}
              onSelect={selectEntity}
            />
          }
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
  );

  return hasReflectedEntityDataReader ? (
    <ExplorerEntityInstanceWorkspaceProvider entities={entities}>
      {browser}
    </ExplorerEntityInstanceWorkspaceProvider>
  ) : (
    browser
  );
}
