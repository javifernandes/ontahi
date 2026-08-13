import type { ReflectedEntityDataQuery, ReflectedEntityDataResult } from '@ontahi/core/data-graph';
import {
  createFetchOperationBridgeAdapter,
  createFetchReflectedOperationInvoker,
} from '@ontahi/react/actions';
import { OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { Explorer } from './Explorer.js';
import './styles.css';

const queryClient = new QueryClient();
const bridge = createFetchOperationBridgeAdapter({
  endpoint: '/operations',
  taskEndpoint: '/operations/tasks',
});
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
const Root = globalThis.location.pathname.startsWith('/explorer') ? Explorer : App;

createRoot(document.querySelector('#root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <OntahiGraphProvider
        runtime={{ name: 'todo-browser' }}
        operationBridgeAdapters={[bridge]}
        reflectedOperationInvoker={reflectedOperationInvoker}
        reflectedEntityDataReader={reflectedEntityDataReader}
      >
        <Root />
      </OntahiGraphProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
