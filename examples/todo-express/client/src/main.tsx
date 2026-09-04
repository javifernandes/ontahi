import { createRuntimeGraphClient, OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { Explorer } from './Explorer.js';
import {
  createTodoRuntimeTransportRouter,
  loadTodoTransportRouting,
  saveTodoTransportRouting,
} from './runtime-transport-routing.js';
import {
  loadAuthenticationSession,
  type AuthenticationSession,
  type BootstrapState,
} from './todo-app/bootstrap.js';
import './styles.css';

const queryClient = new QueryClient();
const transportRouter = createTodoRuntimeTransportRouter({
  initialRouting: loadTodoTransportRouting(globalThis.localStorage),
});
const graphClient = createRuntimeGraphClient({ runtimeTransport: transportRouter.transport });
const isExplorer = globalThis.location.pathname.startsWith('/explorer');

const TodoClient = () => {
  const [authentication, setAuthentication] = useState<BootstrapState<AuthenticationSession>>({
    status: 'loading',
  });
  const [transportRouting, setTransportRoutingState] = useState(transportRouter.routing);

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
  const setTransportRouting = (routing: typeof transportRouting) => {
    transportRouter.configure(routing);
    saveTodoTransportRouting(globalThis.localStorage, routing);
    setTransportRoutingState(routing);
    void queryClient.invalidateQueries();
  };
  return (
    <OntahiGraphProvider
      runtime={{ name: 'todo-browser' }}
      identity={identity}
      client={graphClient}
    >
      {isExplorer ? (
        <Explorer />
      ) : (
        <App
          authentication={authentication}
          setAuthentication={setAuthentication}
          transportRouting={transportRouting}
          setTransportRouting={setTransportRouting}
        />
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
