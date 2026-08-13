import {
  ExplorerEntityBrowser,
  ExplorerOperationsBrowser,
  ExplorerOverview,
  ExplorerProvider,
  ExplorerTasksBrowser,
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
  ) : pathname.startsWith('/explorer/entities') ? (
    <ExplorerEntityBrowser
      entities={data.entityDetails}
      operations={data.snapshot.operations}
      tasks={data.snapshot.tasks}
      selectedEntityName={selectedPathSegment('/explorer/entities/')}
    />
  ) : pathname.startsWith('/explorer/operations') ? (
    <ExplorerOperationsBrowser
      operations={data.snapshot.operations}
      selectedOperationId={selectedPathSegment('/explorer/operations/')}
    />
  ) : pathname.startsWith('/explorer/tasks') ? (
    <ExplorerTasksBrowser
      tasks={data.snapshot.tasks}
      recentTaskRuns={data.snapshot.recentTaskRuns}
      selectedTaskId={selectedPathSegment('/explorer/tasks/')}
    />
  ) : (
    <ExplorerOverview snapshot={data.snapshot} />
  );

  return (
    <div className='explorer-host'>
      <ExplorerProvider basePath='/explorer'>
        <nav className='explorer-nav'>
          <a href='/'>← Todo app</a>
          <a href='/explorer'>Overview</a>
          <a href='/explorer/entities'>Entities</a>
          <a href='/explorer/operations'>Operations</a>
          <a href='/explorer/tasks'>Tasks</a>
        </nav>
        {content}
      </ExplorerProvider>
    </div>
  );
};
