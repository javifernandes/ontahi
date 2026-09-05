import {
  ExplorerEntityBrowser,
  ExplorerEventBrowser,
  ExplorerOperationsBrowser,
  ExplorerOverview,
  ExplorerShell,
  ExplorerTasksBrowser,
  isExplorerEntityBrowserTab,
  isExplorerOperationBrowserTab,
  isExplorerTaskBrowserTab,
} from '@ontahi/explorer-react/components';
import type { ExplorerEntityDetail, ExplorerSnapshot } from '@ontahi/explorer-react/contracts';
import { useEffect, useState } from 'react';

type TodoExplorerSnapshot = {
  snapshot: ExplorerSnapshot;
  entityDetails: ExplorerEntityDetail[];
};

const selectedPathSegment = (prefix: string) => {
  if (!globalThis.location.pathname.startsWith(prefix)) return undefined;
  const value = globalThis.location.pathname.slice(prefix.length).split('/')[0];
  return value ? decodeURIComponent(value) : undefined;
};

export const Explorer = () => {
  const [data, setData] = useState<TodoExplorerSnapshot>();
  const [error, setError] = useState(false);
  const pathname = globalThis.location.pathname;
  const requestedTab = new URLSearchParams(globalThis.location.search).get('tab') ?? undefined;

  useEffect(() => {
    void fetch('/explorer/snapshot')
      .then(response => {
        if (!response.ok) throw new Error('Could not load Explorer snapshot.');
        return response.json() as Promise<TodoExplorerSnapshot>;
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const content = !data ? (
    <p>{error ? 'Could not load Ontahi Explorer.' : 'Loading Ontahi Explorer…'}</p>
  ) : pathname.startsWith('/explorer/operations') ? (
    <ExplorerOperationsBrowser
      operations={data.snapshot.operations}
      selectedOperationId={selectedPathSegment('/explorer/operations/')}
      selectedTab={isExplorerOperationBrowserTab(requestedTab) ? requestedTab : undefined}
    />
  ) : pathname.startsWith('/explorer/tasks') ? (
    <ExplorerTasksBrowser
      tasks={data.snapshot.tasks}
      recentTaskRuns={data.snapshot.recentTaskRuns}
      selectedTaskId={selectedPathSegment('/explorer/tasks/')}
      selectedTab={isExplorerTaskBrowserTab(requestedTab) ? requestedTab : undefined}
    />
  ) : pathname.startsWith('/explorer/events') ? (
    <ExplorerEventBrowser
      events={data.snapshot.events}
      selectedEventType={selectedPathSegment('/explorer/events/')}
    />
  ) : pathname.startsWith('/explorer/entities') ? (
    <ExplorerEntityBrowser
      entities={data.entityDetails}
      operations={data.snapshot.operations}
      tasks={data.snapshot.tasks}
      selectedEntityName={selectedPathSegment('/explorer/entities/')}
      selectedTab={isExplorerEntityBrowserTab(requestedTab) ? requestedTab : undefined}
    />
  ) : (
    <ExplorerOverview snapshot={data.snapshot} />
  );

  return (
    <div className='explorer-host' data-explorer-theme-host>
      <ExplorerShell
        basePath='/explorer'
        currentPath={pathname}
        headerEnd={
          <a className='explorer-exit' href='/'>
            ← Todo
          </a>
        }
      >
        {content}
      </ExplorerShell>
    </div>
  );
};
