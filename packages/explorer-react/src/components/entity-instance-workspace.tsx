'use client';

import { entityRefsEqual, type AnyEntityRef } from '@ontahi/core/data-graph';
import {
  useGraphExecutorCapability,
  useHasReflectedRelatedEntityDataReader,
  useReflectedEntityDataReader,
} from '@ontahi/react/graph';
import { useQueryClient } from '@tanstack/react-query';
import { Boxes } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';

import type { ExplorerEntityDetail, ExplorerOperationDescriptor } from '../contracts/index.js';

import type { ExplorerEntityMutationRunner } from './entity-data-mutations.js';
import { ExplorerEntityInstanceInspector } from './entity-instance-inspector.js';
import {
  ExplorerDraggableWorkspaceNode,
  type ExplorerWorkspaceNodePosition,
} from './entity-instance-node.js';
import { getExplorerEntityInstanceLabel, getExplorerRowRef } from './entity-instance-values.js';
import type { ExplorerOperationExecutePanelRenderer } from './operation-detail.js';
import type { ExplorerOperationRefInputRenderer } from './operation-execute-panel.js';

export type ExplorerInstanceWindow = {
  entityName: string;
  key: string;
  minimized: boolean;
  position: ExplorerInstanceWindowPosition;
  row: Record<string, unknown>;
  source: AnyEntityRef;
};

export type ExplorerInstanceWindowPosition = ExplorerWorkspaceNodePosition;

export type ExplorerInstanceNavigation = {
  href: string;
  row?: Record<string, unknown>;
  source?: AnyEntityRef;
};

type InstanceWorkspace = {
  activeKey?: string;
  collectionActive: boolean;
  windows: ExplorerInstanceWindow[];
};

type InstanceWorkspaceAction =
  | { type: 'activate'; key: string }
  | { type: 'activate-collection' }
  | { type: 'close'; key: string }
  | { type: 'minimize'; key: string }
  | { type: 'move'; key: string; position: ExplorerInstanceWindowPosition }
  | { type: 'open'; window: ExplorerInstanceWindow }
  | { type: 'refresh'; key: string; row: Record<string, unknown> }
  | { type: 'restore'; key: string };

type ExplorerInstanceWorkspaceContextValue = {
  activeKey?: string;
  collectionActive: boolean;
  activateCollection: () => void;
  navigate: (input: ExplorerInstanceNavigation) => void;
  open: (input: {
    entity: ExplorerEntityDetail;
    row: Record<string, unknown>;
    source: AnyEntityRef;
  }) => void;
};

const ExplorerInstanceWorkspaceContext =
  createContext<ExplorerInstanceWorkspaceContextValue | null>(null);

export const explorerInstanceWindowKey = (source: AnyEntityRef) =>
  JSON.stringify({ entityName: source.entityName, locator: source.locator });

const latestExpandedWindowKey = (windows: ExplorerInstanceWindow[]) =>
  [...windows].reverse().find(window => !window.minimized)?.key;

const instanceWindowMargin = 12;
const instanceWindowTop = 96;
const instanceWindowWidth = 432;
const instanceCollapsedNodeWidth = 288;
const instanceWindowGap = 12;

export const getDefaultExplorerInstanceWindowPosition = (
  expandedWindowCount: number,
  viewportWidth = globalThis.innerWidth,
): ExplorerInstanceWindowPosition => {
  const width = Math.min(instanceWindowWidth, viewportWidth - instanceWindowMargin * 2);
  const columnWidth = width + instanceWindowGap;
  const columns = Math.max(1, Math.floor((viewportWidth - instanceWindowMargin * 2) / columnWidth));
  const column = expandedWindowCount % columns;
  const row = Math.floor(expandedWindowCount / columns);

  return {
    x: Math.max(
      instanceWindowMargin,
      viewportWidth - instanceWindowMargin - width - columnWidth * column,
    ),
    y: instanceWindowTop + row * 32,
  };
};

const getVisibleExplorerInstanceWindowPosition = (
  position: ExplorerInstanceWindowPosition,
  width = instanceWindowWidth,
  minimumHeight = 240,
): ExplorerInstanceWindowPosition => {
  const visibleWidth = Math.min(width, globalThis.innerWidth - instanceWindowMargin * 2);
  return {
    x: Math.min(
      Math.max(instanceWindowMargin, position.x),
      Math.max(instanceWindowMargin, globalThis.innerWidth - visibleWidth - instanceWindowMargin),
    ),
    y: Math.min(
      Math.max(instanceWindowMargin, position.y),
      Math.max(instanceWindowMargin, globalThis.innerHeight - minimumHeight - instanceWindowMargin),
    ),
  };
};

const reduceInstanceWorkspace = (
  state: InstanceWorkspace,
  action: InstanceWorkspaceAction,
): InstanceWorkspace => {
  if (action.type === 'activate') {
    return { ...state, activeKey: action.key, collectionActive: false };
  }

  if (action.type === 'activate-collection') {
    return { ...state, collectionActive: true };
  }

  if (action.type === 'open') {
    const existing = state.windows.some(window => window.key === action.window.key);
    const windows = existing
      ? state.windows.map(window =>
          window.key === action.window.key
            ? { ...action.window, minimized: false, position: window.position }
            : window,
        )
      : [...state.windows, action.window];
    return { windows, activeKey: action.window.key, collectionActive: false };
  }

  if (action.type === 'move') {
    return {
      windows: state.windows.map(window =>
        window.key === action.key ? { ...window, position: action.position } : window,
      ),
      activeKey: action.key,
      collectionActive: false,
    };
  }

  if (action.type === 'restore') {
    return {
      windows: state.windows.map(window =>
        window.key === action.key ? { ...window, minimized: false } : window,
      ),
      activeKey: action.key,
      collectionActive: false,
    };
  }

  if (action.type === 'refresh') {
    return {
      ...state,
      windows: state.windows.map(window =>
        window.key === action.key ? { ...window, row: action.row } : window,
      ),
    };
  }

  if (action.type === 'close') {
    const windows = state.windows.filter(window => window.key !== action.key);
    const activeKey =
      state.activeKey === action.key ? latestExpandedWindowKey(windows) : state.activeKey;
    return {
      windows,
      activeKey,
      collectionActive: activeKey ? state.collectionActive : true,
    };
  }

  const windows = state.windows.map(window =>
    window.key === action.key ? { ...window, minimized: true } : window,
  );
  const activeKey =
    state.activeKey === action.key ? latestExpandedWindowKey(windows) : state.activeKey;
  return {
    windows,
    activeKey,
    collectionActive: activeKey ? state.collectionActive : true,
  };
};

const findWorkspaceEntity = (entities: ExplorerEntityDetail[], window: ExplorerInstanceWindow) =>
  entities.find(entity => entity.name === window.entityName);

const readWorkspaceWindow = async (
  entity: ExplorerEntityDetail,
  source: AnyEntityRef,
  readEntityData: ReturnType<typeof useReflectedEntityDataReader>['readEntityData'],
) => {
  const result = await readEntityData({
    entityName: entity.name,
    filters: Object.entries(source.locator).map(([field, value]) => ({
      field,
      operator: 'equals' as const,
      value: String(value),
    })),
    page: 1,
    pageSize: 10,
  });

  return result.rows.find(row => {
    const rowRef = getExplorerRowRef(entity, row);
    return rowRef ? entityRefsEqual(rowRef, source) : false;
  });
};

const WorkspaceWindows = ({
  dispatch,
  entities,
  onNavigate,
  operations,
  renderExecutePanel,
  renderRefInput,
  state,
}: {
  dispatch: Dispatch<InstanceWorkspaceAction>;
  entities: ExplorerEntityDetail[];
  onNavigate: (input: ExplorerInstanceNavigation) => void;
  operations: ExplorerOperationDescriptor[];
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
  state: InstanceWorkspace;
}) => {
  const graphExecutor = useGraphExecutorCapability();
  const hasRelatedReader = useHasReflectedRelatedEntityDataReader();
  const reader = useReflectedEntityDataReader();
  const queryClient = useQueryClient();
  const runMutation: ExplorerEntityMutationRunner | undefined =
    graphExecutor?.runEntityMutationCommand
      ? command => graphExecutor.runEntityMutationCommand!(command)
      : undefined;
  useEffect(() => {
    if (!state.activeKey) return;

    const closeActiveWindow = (event: globalThis.KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (event.key === 'Escape' && state.activeKey) {
        dispatch({ type: 'close', key: state.activeKey });
      }
    };
    document.addEventListener('keydown', closeActiveWindow);
    return () => document.removeEventListener('keydown', closeActiveWindow);
  }, [dispatch, state.activeKey]);

  const refreshWindow = async (window: ExplorerInstanceWindow) => {
    const entity = findWorkspaceEntity(entities, window);
    if (!entity) return;

    const refreshedRow = await readWorkspaceWindow(entity, window.source, reader.readEntityData);
    if (refreshedRow) dispatch({ type: 'refresh', key: window.key, row: refreshedRow });

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['graph', 'reflected-entity-data'] }),
      queryClient.invalidateQueries({ queryKey: ['graph', 'reflected-related-entity-data'] }),
    ]);
  };

  return state.windows.length > 0 ? (
    <div
      aria-label='Open instance windows'
      className='pointer-events-none fixed inset-0'
      style={{ zIndex: state.collectionActive ? 50 : 60 }}
    >
      {state.windows.map((window, index) => {
        const entity = findWorkspaceEntity(entities, window);
        if (!entity) return null;
        const label = getExplorerEntityInstanceLabel(entity, window.row);
        const position = getVisibleExplorerInstanceWindowPosition(
          window.position,
          window.minimized ? instanceCollapsedNodeWidth : instanceWindowWidth,
          window.minimized ? 56 : 240,
        );
        const restoreWindow = () => {
          const expandedPosition = getVisibleExplorerInstanceWindowPosition(window.position);
          if (
            expandedPosition.x !== window.position.x ||
            expandedPosition.y !== window.position.y
          ) {
            dispatch({ type: 'move', key: window.key, position: expandedPosition });
          }
          dispatch({ type: 'restore', key: window.key });
          void refreshWindow(window).catch(() => undefined);
        };

        return (
          <ExplorerDraggableWorkspaceNode
            key={window.key}
            position={position}
            constraintWidth={window.minimized ? instanceCollapsedNodeWidth : instanceWindowWidth}
            maxHeight={`calc(100vh - ${position.y + 12}px)`}
            zIndex={state.activeKey === window.key ? state.windows.length + 1 : index}
            onActivate={() => dispatch({ type: 'activate', key: window.key })}
            onDoubleClick={
              window.minimized
                ? restoreWindow
                : () => dispatch({ type: 'minimize', key: window.key })
            }
            onMove={position => dispatch({ type: 'move', key: window.key, position })}
          >
            {dragging =>
              window.minimized ? (
                <button
                  type='button'
                  data-explorer-workspace-drag-handle
                  aria-label={`Restore ${entity.name} instance ${label}`}
                  title='Drag to move · Double-click to restore'
                  onClick={event => {
                    if (event.detail === 0) restoreWindow();
                  }}
                  className={`group pointer-events-auto flex touch-none select-none items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 text-left backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                    dragging
                      ? 'cursor-grabbing border-primary/50 shadow-2xl ring-2 ring-primary/20'
                      : state.activeKey === window.key
                        ? 'cursor-grab border-primary/35 shadow-xl ring-1 ring-primary/15'
                        : 'cursor-grab border-border/80 shadow-lg hover:border-primary/40 hover:shadow-xl'
                  }`}
                >
                  <Boxes className='size-4 shrink-0 text-primary' />
                  <span className='min-w-0 max-w-56'>
                    <span className='block truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground'>
                      {entity.name}
                    </span>
                    <span className='block truncate text-sm font-medium text-foreground'>
                      {label}
                    </span>
                  </span>
                </button>
              ) : (
                <ExplorerEntityInstanceInspector
                  active={state.activeKey === window.key}
                  canReadRelatedData={hasRelatedReader}
                  dragging={dragging}
                  entity={entity}
                  operations={operations}
                  renderExecutePanel={renderExecutePanel}
                  renderRefInput={renderRefInput}
                  row={window.row}
                  runMutation={runMutation}
                  source={window.source}
                  onActivate={() => dispatch({ type: 'activate', key: window.key })}
                  onMinimize={() => dispatch({ type: 'minimize', key: window.key })}
                  onClose={() => dispatch({ type: 'close', key: window.key })}
                  onNavigate={onNavigate}
                  onUpdated={() => refreshWindow(window)}
                />
              )
            }
          </ExplorerDraggableWorkspaceNode>
        );
      })}
    </div>
  ) : null;
};

export const ExplorerEntityInstanceWorkspaceProvider = ({
  children,
  entities,
  operations = [],
  renderExecutePanel,
  renderRefInput,
}: {
  children: ReactNode;
  entities: ExplorerEntityDetail[];
  operations?: ExplorerOperationDescriptor[];
  renderExecutePanel?: ExplorerOperationExecutePanelRenderer;
  renderRefInput?: ExplorerOperationRefInputRenderer;
}) => {
  const [state, dispatch] = useReducer(reduceInstanceWorkspace, {
    collectionActive: true,
    windows: [],
  });
  const createWindow = ({
    entity,
    row,
    source,
  }: {
    entity: ExplorerEntityDetail;
    row: Record<string, unknown>;
    source: AnyEntityRef;
  }): ExplorerInstanceWindow => ({
    entityName: entity.name,
    key: explorerInstanceWindowKey(source),
    minimized: false,
    position: getDefaultExplorerInstanceWindowPosition(state.windows.length),
    row,
    source,
  });
  const navigate = (input: ExplorerInstanceNavigation) => {
    if (input.source) {
      const key = explorerInstanceWindowKey(input.source);
      const entity = entities.find(candidate => candidate.name === input.source?.entityName);
      const existing = state.windows.some(window => window.key === key);

      if (input.row && entity) {
        dispatch({
          type: 'open',
          window: createWindow({ entity, row: input.row, source: input.source }),
        });
      } else if (existing) {
        dispatch({ type: 'restore', key });
      }
    }

    globalThis.history.pushState(null, '', input.href);
    globalThis.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  };

  return (
    <ExplorerInstanceWorkspaceContext.Provider
      value={{
        activeKey: state.activeKey,
        collectionActive: state.collectionActive,
        activateCollection: () => dispatch({ type: 'activate-collection' }),
        navigate,
        open: ({ entity, row, source }) =>
          dispatch({
            type: 'open',
            window: createWindow({ entity, row, source }),
          }),
      }}
    >
      {children}
      <WorkspaceWindows
        entities={entities}
        operations={operations}
        renderExecutePanel={renderExecutePanel}
        renderRefInput={renderRefInput}
        state={state}
        dispatch={dispatch}
        onNavigate={navigate}
      />
    </ExplorerInstanceWorkspaceContext.Provider>
  );
};

export const useExplorerEntityInstanceWorkspace = () =>
  useContext(ExplorerInstanceWorkspaceContext);
