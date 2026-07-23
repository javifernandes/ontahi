import { createFetchOperationBridgeAdapter } from '@ontahi/react/actions';
import { OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles.css';

const queryClient = new QueryClient();
const bridge = createFetchOperationBridgeAdapter({
  endpoint: '/operations',
  taskEndpoint: '/operations/tasks',
});

createRoot(document.querySelector('#root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <OntahiGraphProvider runtime={{ name: 'todo-browser' }} operationBridgeAdapters={[bridge]}>
        <App />
      </OntahiGraphProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
