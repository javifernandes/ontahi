import { OntahiGraphProvider } from '@ontahi/react/graph';
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
    <OntahiGraphProvider runtime={{ name: 'todo-browser' }} identity={identity}>
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
