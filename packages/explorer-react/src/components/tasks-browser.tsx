'use client';

import { ChevronRight, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';

import type {
  ExplorerTaskDescriptor,
  ExplorerRecentTaskRunsLoader,
  ExplorerTaskRunListItem,
  ExplorerTaskRunSource,
  ExplorerTaskRunSourceLoader,
} from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { useExplorerConfig, useExplorerRoutes } from './config.js';
import { humanizeExplorerName } from './display-name.js';
import { ExplorerJsonEditor } from './json-editor.js';
import { ExplorerTaskDetail } from './operation-detail-panels.js';
import {
  explorerTaskBrowserTabs,
  getExplorerTabFromSearch,
  parseExplorerTaskBrowserTab,
  type ExplorerTaskBrowserTab,
} from './routes.js';

export { explorerTaskBrowserTabs };
export type { ExplorerTaskBrowserTab };

export type {
  ExplorerRecentTaskRunsLoader,
  ExplorerTaskRunRef,
  ExplorerTaskRunSourceLoader,
} from '../contracts/index.js';

export type ExplorerTasksBrowserProps = {
  tasks: ExplorerTaskDescriptor[];
  recentTaskRuns: ExplorerTaskRunListItem[];
  selectedTab?: ExplorerTaskBrowserTab;
  selectedTaskId?: string;
  loadRecentTaskRuns?: ExplorerRecentTaskRunsLoader;
  loadTaskRunSource?: ExplorerTaskRunSourceLoader;
  className?: string;
};

const refreshIntervalMs = 5000;

const getTaskIdFromPathname = (pathname: string, basePath: string) => {
  const prefix = `${basePath}/tasks/`;

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const encodedTaskId = pathname.slice(prefix.length).split('/')[0];

  return encodedTaskId ? decodeURIComponent(encodedTaskId) : undefined;
};

const getSelectedTaskId = (tasks: ExplorerTaskDescriptor[], selectedTaskId: string | undefined) => {
  if (selectedTaskId && tasks.some(task => task.id === selectedTaskId)) {
    return selectedTaskId;
  }

  return tasks[0]?.id ?? '';
};

const statusClassName = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-800';
    case 'failed':
      return 'bg-rose-100 text-rose-800';
    case 'running':
      return 'bg-amber-100 text-amber-800';
    case 'queued':
      return 'bg-sky-100 text-sky-800';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
};

const taskRunDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatTimestamp = (value: string | undefined) => {
  if (!value) {
    return 'unknown';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return taskRunDateTimeFormatter.format(parsed);
};

const parseTimestampMs = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed) ? null : parsed;
};

const formatDuration = (run: ExplorerTaskRunListItem) => {
  const start = parseTimestampMs(run.startedAt) ?? parseTimestampMs(run.createdAt);
  const end = parseTimestampMs(run.completedAt);

  if (start == null || end == null || end < start) {
    return run.status === 'running' ? 'running' : 'unknown';
  }

  const durationMs = end - start;
  const seconds = Math.round(durationMs / 1000);

  if (seconds < 1) {
    return '<1s';
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const formatProgressPercent = (run: ExplorerTaskRunListItem) => {
  if (typeof run.progress?.percent === 'number') {
    return `${Math.round(run.progress.percent)}%`;
  }

  return run.status === 'completed' ? '100%' : 'unknown';
};

const getProgressPercentValue = (run: ExplorerTaskRunListItem) => {
  if (typeof run.progress?.percent === 'number') {
    return Math.min(100, Math.max(0, run.progress.percent));
  }

  return run.status === 'completed' ? 100 : 0;
};

const getTaskRunHeadline = (run: ExplorerTaskRunListItem) =>
  run.status === 'failed'
    ? (run.error?.message ?? run.progress?.message ?? `Task run ${run.status}.`)
    : (run.progress?.message ?? run.error?.message ?? `Task run ${run.status}.`);

const formatJsonValue = (value: unknown) => JSON.stringify(value ?? null, null, 2);

const formatActor = (run: ExplorerTaskRunListItem) => {
  const actor = run.trigger.actor;

  if (!actor) {
    return 'unknown actor';
  }

  return actor.id ? `${actor.kind}:${actor.id}` : actor.kind;
};

const ExplorerTasksTabs = ({
  activeTab,
  onTabChange,
  selectedRunsCount,
}: {
  activeTab: ExplorerTaskBrowserTab;
  onTabChange: (tab: ExplorerTaskBrowserTab) => void;
  selectedRunsCount: number;
}) => (
  <div className='flex flex-wrap gap-2 border-b px-5 pt-4'>
    {[
      { id: 'structure' as const, label: 'Schema' },
      { id: 'runs' as const, label: `Recent runs (${selectedRunsCount})` },
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

const TaskRunMeta = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
      {label}
    </dt>
    <dd className='mt-1 break-all font-mono text-xs text-foreground'>{value}</dd>
  </div>
);

const TaskRunCard = ({
  isOpen,
  loadTaskRunSource,
  onOpenChange,
  run,
}: {
  isOpen: boolean;
  loadTaskRunSource?: ExplorerTaskRunSourceLoader;
  onOpenChange: (isOpen: boolean) => void;
  run: ExplorerTaskRunListItem;
}) => {
  const progressPercent = getProgressPercentValue(run);
  const [source, setSource] = useState<ExplorerTaskRunSource | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState(false);

  useEffect(() => {
    if (!isOpen || !loadTaskRunSource) {
      return;
    }

    let isCurrent = true;

    const loadSource = async () => {
      setIsLoadingSource(true);
      setSourceError(null);

      try {
        const nextSource = await loadTaskRunSource({
          taskId: run.taskId,
          runId: run.runId,
        });

        if (isCurrent) {
          setSource(nextSource);
        }
      } catch (error) {
        if (isCurrent) {
          setSourceError(
            error instanceof Error ? error.message : 'Failed to load task run payloads.',
          );
        }
      } finally {
        if (isCurrent) {
          setIsLoadingSource(false);
        }
      }
    };

    void loadSource();

    return () => {
      isCurrent = false;
    };
  }, [isOpen, loadTaskRunSource, run.runId, run.taskId, run.updatedAt]);

  return (
    <details
      className='group overflow-hidden rounded-md border bg-card'
      open={isOpen}
      onToggle={event => onOpenChange(event.currentTarget.open)}
    >
      <summary className='grid cursor-pointer gap-3 p-4 marker:content-none'>
        <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]'>
          <div className='min-w-0'>
            <div className='flex min-w-0 items-start gap-2'>
              <ChevronRight className='mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90' />
              <div className='min-w-0'>
                <div className='break-words text-sm font-semibold text-foreground'>
                  {getTaskRunHeadline(run)}
                </div>
                <div className='mt-1 break-all font-mono text-xs text-muted-foreground'>
                  {run.runId}
                </div>
              </div>
            </div>
          </div>
          <div className='grid gap-1 text-left md:min-w-28 md:text-right'>
            <span
              className={cx(
                'inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-medium md:ml-auto',
                statusClassName(run.status),
              )}
            >
              {run.status}
            </span>
            <span className='text-xs font-medium text-foreground'>
              {formatProgressPercent(run)}
            </span>
            <span className='text-xs text-muted-foreground'>{formatDuration(run)}</span>
          </div>
        </div>
        <div className='h-1.5 overflow-hidden rounded-full bg-muted'>
          <div
            className='h-full rounded-full bg-primary'
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </summary>

      <div className='grid gap-4 border-t px-4 pb-4 pt-4'>
        {run.error ? (
          <div className='rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm'>
            <div className='font-mono text-xs font-semibold text-destructive'>{run.error.code}</div>
            <div className='mt-1 text-destructive'>{run.error.message}</div>
          </div>
        ) : null}

        <dl className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
          <TaskRunMeta label='Created' value={formatTimestamp(run.createdAt)} />
          <TaskRunMeta label='Started' value={formatTimestamp(run.startedAt)} />
          <TaskRunMeta label='Updated' value={formatTimestamp(run.updatedAt)} />
          <TaskRunMeta label='Completed' value={formatTimestamp(run.completedAt)} />
          <TaskRunMeta label='Trigger' value={run.trigger.cause} />
          <TaskRunMeta label='Actor' value={formatActor(run)} />
          <TaskRunMeta label='Runtime' value={run.runtime?.name ?? 'none'} />
          <TaskRunMeta label='Runtime Run' value={run.runtime?.runId ?? 'none'} />
          {run.subject ? (
            <TaskRunMeta label='Subject' value={`${run.subject.type}:${run.subject.id}`} />
          ) : null}
          {run.trigger.ingress?.kind ? (
            <TaskRunMeta label='Ingress' value={run.trigger.ingress.kind} />
          ) : null}
          {run.trigger.source?.provider ? (
            <TaskRunMeta label='Source' value={run.trigger.source.provider} />
          ) : null}
          {run.trigger.source?.event ? (
            <TaskRunMeta label='Event' value={run.trigger.source.event} />
          ) : null}
        </dl>
        {sourceError ? (
          <div className='rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive'>
            {sourceError}
          </div>
        ) : null}

        {isLoadingSource && !source ? (
          <div className='rounded-md bg-muted/35 p-3 text-sm text-muted-foreground'>
            Loading task payloads...
          </div>
        ) : null}

        {source ? (
          <div className='grid gap-3 lg:grid-cols-2'>
            <ExplorerJsonEditor
              label='Input'
              value={formatJsonValue(source.input)}
              path={`explorer://task-runs/${run.runId}/input.json`}
              height='180px'
              readOnly
            />
            <ExplorerJsonEditor
              label='Return value'
              value={formatJsonValue(source.result)}
              path={`explorer://task-runs/${run.runId}/return-value.json`}
              height='180px'
              readOnly
            />
          </div>
        ) : null}
      </div>
    </details>
  );
};

const useExplorerTaskRuns = ({
  initialActiveTab = 'structure',
  initialRuns,
  loadRecentTaskRuns,
  selectedTask,
}: {
  initialRuns: ExplorerTaskRunListItem[];
  initialActiveTab?: ExplorerTaskBrowserTab;
  loadRecentTaskRuns?: ExplorerRecentTaskRunsLoader;
  selectedTask: ExplorerTaskDescriptor | undefined;
}) => {
  const [activeTab, setActiveTab] = useState<ExplorerTaskBrowserTab>(initialActiveTab);
  const [runs, setRuns] = useState(initialRuns);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  useEffect(() => {
    setActiveTab(initialActiveTab);
  }, [initialActiveTab]);

  const refresh = useCallback(async () => {
    if (!loadRecentTaskRuns) {
      return;
    }

    setIsRefreshing(true);
    setRefreshError(null);

    try {
      setRuns(await loadRecentTaskRuns());
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Failed to refresh task runs.');
    } finally {
      setIsRefreshing(false);
    }
  }, [loadRecentTaskRuns]);

  useEffect(() => {
    if (activeTab !== 'runs' || !loadRecentTaskRuns) {
      return;
    }

    const interval = globalThis.setInterval(() => {
      void refresh();
    }, refreshIntervalMs);

    return () => globalThis.clearInterval(interval);
  }, [activeTab, loadRecentTaskRuns, refresh]);

  const selectedRuns = useMemo(
    () => (selectedTask ? runs.filter(run => run.taskId === selectedTask.id) : runs),
    [runs, selectedTask],
  );

  return {
    activeTab,
    canRefresh: Boolean(loadRecentTaskRuns),
    isRefreshing,
    refresh,
    refreshError,
    refreshIntervalMs,
    runs,
    selectedRuns,
    setActiveTab,
  };
};

export function ExplorerTasksBrowser({
  className,
  loadRecentTaskRuns,
  loadTaskRunSource,
  recentTaskRuns,
  selectedTab,
  selectedTaskId,
  tasks,
}: ExplorerTasksBrowserProps) {
  const { basePath, loadTaskRunSource: configuredTaskRunSourceLoader } = useExplorerConfig();
  const taskRunSourceLoader = loadTaskRunSource ?? configuredTaskRunSourceLoader;
  const routes = useExplorerRoutes();
  const [query, setQuery] = useState('');
  const [openRunIds, setOpenRunIds] = useState(() => new Set<string>());
  const [selectedId, setSelectedId] = useState(() => getSelectedTaskId(tasks, selectedTaskId));
  const filteredTasks = useMemo(
    () =>
      tasks.filter(task => {
        const text = `${task.id} ${task.name} ${task.entityName}`.toLowerCase();

        return text.includes(query.toLowerCase());
      }),
    [query, tasks],
  );
  const selectedTask = tasks.find(task => task.id === selectedId) ?? filteredTasks[0] ?? tasks[0];
  const taskRuns = useExplorerTaskRuns({
    initialActiveTab: parseExplorerTaskBrowserTab(selectedTab),
    initialRuns: recentTaskRuns,
    loadRecentTaskRuns,
    selectedTask,
  });
  const { setActiveTab } = taskRuns;

  useEffect(() => {
    setSelectedId(currentSelectedId => {
      if (selectedTaskId && tasks.some(task => task.id === selectedTaskId)) {
        return selectedTaskId;
      }

      if (tasks.some(task => task.id === currentSelectedId)) {
        return currentSelectedId;
      }

      return tasks[0]?.id ?? '';
    });
    setActiveTab(parseExplorerTaskBrowserTab(selectedTab));
  }, [selectedTaskId, selectedTab, setActiveTab, tasks]);

  useEffect(() => {
    const handlePopState = () => {
      const taskId = getTaskIdFromPathname(globalThis.location.pathname, basePath);

      if (taskId && tasks.some(task => task.id === taskId)) {
        setSelectedId(taskId);
      }

      setActiveTab(
        parseExplorerTaskBrowserTab(getExplorerTabFromSearch(globalThis.location.search)),
      );
    };

    globalThis.addEventListener('popstate', handlePopState);

    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [basePath, setActiveTab, tasks]);

  const selectTask = (clickEvent: MouseEvent<HTMLAnchorElement>, taskId: string) => {
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
    setSelectedId(taskId);
    setActiveTab('structure');
    globalThis.history.pushState(null, '', routes.task(taskId));
  };
  const selectTab = (nextTab: ExplorerTaskBrowserTab) => {
    if (!selectedTask) {
      return;
    }

    setActiveTab(nextTab);
    globalThis.history.pushState(null, '', routes.task(selectedTask.id, { tab: nextTab }));
  };
  const setRunOpen = (run: ExplorerTaskRunListItem, isOpen: boolean) => {
    const key = `${run.taskId}:${run.runId}`;

    setOpenRunIds(current => {
      if (current.has(key) === isOpen) {
        return current;
      }

      const next = new Set(current);

      if (isOpen) {
        next.add(key);
      } else {
        next.delete(key);
      }

      return next;
    });
  };

  return (
    <div className={cx('grid gap-6', className)}>
      <header>
        <h1 className='text-3xl font-semibold tracking-tight'>Task Catalog</h1>
        <p className='mt-2 max-w-3xl text-sm text-muted-foreground'>
          Inspect task definitions, runtime contracts, steps, and recent task runs.
        </p>
      </header>

      <div className='grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]'>
        <aside className='grid content-start gap-3'>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder='Search tasks'
            aria-label='Search tasks'
            className='min-h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary'
          />
          <div className='overflow-hidden rounded-lg border bg-card'>
            {filteredTasks.map(task => (
              <a
                key={`${task.entityName}:${task.id}:${task.name}`}
                href={routes.task(task.id)}
                onClick={clickEvent => selectTask(clickEvent, task.id)}
                className={cx(
                  'grid w-full gap-1 border-b px-4 py-3 text-left last:border-0 hover:bg-accent/70',
                  selectedTask?.id === task.id && 'bg-primary/10',
                )}
              >
                <span className='text-sm font-semibold text-foreground'>
                  {humanizeExplorerName(task.name)}
                </span>
                <span className='truncate font-mono text-xs text-muted-foreground'>{task.id}</span>
                <span className='text-xs text-muted-foreground'>
                  {task.entityName} · {task.steps.length} steps
                </span>
              </a>
            ))}
            {filteredTasks.length === 0 ? (
              <p className='px-4 py-8 text-sm text-muted-foreground'>No tasks match.</p>
            ) : null}
          </div>
        </aside>

        {selectedTask ? (
          <section className='min-w-0'>
            <section className='overflow-hidden rounded-lg border bg-card'>
              <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                <div className='px-5 py-5'>
                  <a
                    href={routes.entity(selectedTask.entityName)}
                    className='text-sm font-medium text-primary hover:underline'
                  >
                    {selectedTask.entityName}
                  </a>
                  <h2 className='text-xl font-semibold tracking-tight text-foreground'>
                    {humanizeExplorerName(selectedTask.name)}
                  </h2>
                  <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground'>
                    <span>{selectedTask.name}</span>
                    <span>{selectedTask.id}</span>
                  </div>
                </div>
                <div className='px-5 py-5 md:pl-0'>
                  <span className='rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground'>
                    {selectedTask.steps.length} steps
                  </span>
                </div>
              </div>

              <div className='border-t'>
                <ExplorerTasksTabs
                  activeTab={taskRuns.activeTab}
                  onTabChange={selectTab}
                  selectedRunsCount={taskRuns.selectedRuns.length}
                />

                {taskRuns.activeTab === 'structure' ? (
                  <div className='grid gap-4 p-5'>
                    <ExplorerTaskDetail task={selectedTask} />
                  </div>
                ) : (
                  <div className='grid gap-4 p-5'>
                    <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                      <div>
                        <h3 className='text-sm font-semibold text-foreground'>Recent Runs</h3>
                        <p className='mt-1 text-sm text-muted-foreground'>
                          {taskRuns.canRefresh
                            ? `Auto-refreshes every ${taskRuns.refreshIntervalMs / 1000}s while this tab is open.`
                            : 'Shows the task runs supplied by the host.'}
                        </p>
                      </div>
                      {taskRuns.canRefresh ? (
                        <button
                          type='button'
                          onClick={() => void taskRuns.refresh()}
                          className='inline-flex min-h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60'
                          disabled={taskRuns.isRefreshing}
                        >
                          <RefreshCw
                            className={cx('size-4', taskRuns.isRefreshing && 'animate-spin')}
                          />
                          Refresh
                        </button>
                      ) : null}
                    </div>

                    {taskRuns.refreshError ? (
                      <div className='rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive'>
                        {taskRuns.refreshError}
                      </div>
                    ) : null}

                    {taskRuns.selectedRuns.length === 0 ? (
                      <p className='rounded-md bg-muted/35 p-4 text-sm text-muted-foreground'>
                        No recent runs for this task.
                      </p>
                    ) : (
                      <div className='grid gap-3'>
                        {taskRuns.selectedRuns.map(run => (
                          <TaskRunCard
                            key={`${run.taskId}:${run.runId}`}
                            isOpen={openRunIds.has(`${run.taskId}:${run.runId}`)}
                            loadTaskRunSource={taskRunSourceLoader}
                            onOpenChange={isOpen => setRunOpen(run, isOpen)}
                            run={run}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </section>
        ) : null}
      </div>
    </div>
  );
}
