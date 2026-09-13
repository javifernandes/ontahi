import { createRuntimeTransportRouter } from '@ontahi/core/runtime/protocol';
import { createOntahiDiagnostics, instrumentRuntimeTransport } from '@ontahi/devtools';
import { OntahiDevtools, type OntahiDevtoolsConsoleOptions } from '@ontahi/devtools/react';
import {
  createFetchRuntimeTransport,
  createRuntimeGraphClient,
  createWebSocketRuntimeTransport,
  OntahiGraphProvider,
} from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { TagSchema, TodoItemSchema, TodoListSchema } from '../../src/generated/client-entities.js';

import { App } from './App.js';
import { Explorer } from './Explorer.js';
import {
  loadAuthenticationSession,
  type AuthenticationSession,
  type BootstrapState,
} from './todo-app/bootstrap.js';
import './styles.css';

const queryClient = new QueryClient();
const diagnosticsHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);
const sensitiveDiagnosticKey = /authorization|cookie|credential|password|secret|token/i;
const redactTodoDiagnosticValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactTodoDiagnosticValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveDiagnosticKey.test(key) ? '[redacted]' : redactTodoDiagnosticValue(item),
    ]),
  );
};
const diagnostics =
  import.meta.env.DEV || diagnosticsHostnames.has(globalThis.location.hostname)
    ? createOntahiDiagnostics({
        capacity: 500,
        capturePayloads: true,
        redact: redactTodoDiagnosticValue,
      })
    : undefined;
const baseHttpTransport = createFetchRuntimeTransport<never>();
const baseWebSocketTransport = createWebSocketRuntimeTransport();
const runtimeTransport = createRuntimeTransportRouter({
  transports: {
    http: diagnostics
      ? instrumentRuntimeTransport({
          diagnostics,
          id: 'http',
          kind: 'fetch',
          transport: baseHttpTransport,
        })
      : baseHttpTransport,
    websocket: diagnostics
      ? instrumentRuntimeTransport({
          diagnostics,
          id: 'websocket',
          kind: 'websocket',
          transport: baseWebSocketTransport,
        })
      : baseWebSocketTransport,
  },
  routing: {
    'graph.read': 'websocket',
    'graph.command': 'websocket',
    operation: 'websocket',
    'durable.operation.observe': 'websocket',
  },
});
const graphClient = createRuntimeGraphClient({ runtimeTransport });
const isExplorer = globalThis.location.pathname.startsWith('/explorer');
const devtoolsConsole = {
  entities: [TodoListSchema, TodoItemSchema, TagSchema],
  initialDocument: 'TodoItem.where(completed = false).many()',
} satisfies OntahiDevtoolsConsoleOptions;

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
      identity={identity}
      client={graphClient}
    >
      {isExplorer ? (
        <Explorer />
      ) : (
        <App authentication={authentication} setAuthentication={setAuthentication} />
      )}
      {diagnostics ? (
        <OntahiDevtools
          console={{ ...devtoolsConsole, identity }}
          clientCache={graphClient.clientCache}
          diagnostics={diagnostics}
          runtimeTransport={runtimeTransport}
        />
      ) : null}
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
