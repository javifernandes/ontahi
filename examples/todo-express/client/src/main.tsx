import type { ReflectedEntityDataQuery, ReflectedEntityDataResult } from '@ontahi/core/data-graph';
import {
  createFetchOperationBridgeAdapter,
  createFetchReflectedOperationInvoker,
} from '@ontahi/react/actions';
import { createFetchGraphReadExecutor, OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { Explorer } from './Explorer.js';
import {
  loadAuthenticationSession,
  type AuthenticationSession,
  type BootstrapState,
} from './todo-app/bootstrap.js';
import './styles.css';

const queryClient = new QueryClient();
const bridge = createFetchOperationBridgeAdapter({
  endpoint: '/operations',
  taskEndpoint: '/operations/tasks',
});
const graphExecutor = createFetchGraphReadExecutor();
const reflectedOperationInvoker = createFetchReflectedOperationInvoker({
  endpoint: '/operations',
});
const reflectedEntityDataReader = {
  readEntityData: async (query: ReflectedEntityDataQuery): Promise<ReflectedEntityDataResult> => {
    const response = await fetch('/explorer/entities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(query),
    });
    if (!response.ok) throw new Error('Could not load reflected entity data.');
    return response.json() as Promise<ReflectedEntityDataResult>;
  },
};
const isExplorer = globalThis.location.pathname.startsWith('/explorer');

const TodoClient = () => {
  const [authentication, setAuthentication] = useState<BootstrapState<AuthenticationSession>>({
    status: 'loading',
  });

  useEffect(() => {
    void loadAuthenticationSession().then(setAuthentication);
  }, []);

  const identity = useMemo(
    () =>
      authentication.status === 'ready' && authentication.value.principal
        ? { principal: authentication.value.principal }
        : {
            principal: null,
            cacheScope: authentication.status === 'ready' ? 'public' : 'session-loading',
          },
    [authentication],
  );

  return (
    <OntahiGraphProvider
      runtime={{ name: 'todo-browser' }}
      graphExecutor={graphExecutor}
      identity={identity}
      operationBridgeAdapters={[bridge]}
      reflectedOperationInvoker={reflectedOperationInvoker}
      reflectedEntityDataReader={reflectedEntityDataReader}
    >
      {isExplorer ? (
        <Explorer />
      ) : (
        <App authentication={authentication} setAuthentication={setAuthentication} />
      )}
    </OntahiGraphProvider>
  );
};

createRoot(document.querySelector('#root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TodoClient />
    </QueryClientProvider>
  </React.StrictMode>,
);
