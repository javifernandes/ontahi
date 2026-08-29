import {
  ExplorerEntityBrowser,
  ExplorerProvider,
  isExplorerEntityBrowserTab,
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
  const requestedTab = new URLSearchParams(globalThis.location.search).get('tab') ?? undefined;
  const selectedTab = isExplorerEntityBrowserTab(requestedTab) ? requestedTab : undefined;

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
  ) : (
    <ExplorerEntityBrowser
      entities={data.entityDetails}
      operations={data.snapshot.operations}
      tasks={data.snapshot.tasks}
      selectedEntityName={selectedPathSegment('/explorer/entities/')}
      selectedTab={selectedTab}
    />
  );

  return (
    <div className='explorer-host'>
      <ExplorerProvider basePath='/explorer'>
        <a className='explorer-exit' href='/'>
          ← Todo
        </a>
        {content}
      </ExplorerProvider>
    </div>
  );
};
