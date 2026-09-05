import {
  ExplorerEntityBrowser,
  ExplorerProvider,
  isExplorerEntityBrowserTab,
} from '@ontahi/explorer-react/components';
import type {
  ExplorerEntityDetail,
  ExplorerSnapshot,
  ExplorerTaskRunSource,
  ExplorerTaskRunSourceLoader,
} from '@ontahi/explorer-react/contracts';
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

const loadTaskRunSource: ExplorerTaskRunSourceLoader = async ({ taskId, runId }) => {
  const response = await fetch(
    `/operations/tasks/${encodeURIComponent(taskId)}/${encodeURIComponent(runId)}`,
  );
  if (!response.ok) throw new Error('Could not load the task run.');
  const snapshot = (await response.json()) as Omit<ExplorerTaskRunSource, 'input' | 'trigger'>;
  return {
    ...snapshot,
    input: {},
    trigger: { cause: 'user_request' },
  };
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
    <div className='explorer-host' data-explorer-theme-host>
      <ExplorerProvider basePath='/explorer' loadTaskRunSource={loadTaskRunSource}>
        <a className='explorer-exit' href='/'>
          ← Todo
        </a>
        {content}
      </ExplorerProvider>
    </div>
  );
};
