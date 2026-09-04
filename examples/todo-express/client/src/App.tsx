import type { Dispatch, SetStateAction } from 'react';

import type { TodoTransportRouting } from './runtime-transport-routing.js';
import type { AuthenticationSession, BootstrapState } from './todo-app/bootstrap.js';
import { AppHeader } from './todo-app/components/AppHeader.js';
import { TodoBoard } from './todo-app/components/TodoBoard.js';
import { TransportSettings } from './todo-app/components/TransportSettings.js';
import { useTodoApp } from './todo-app/use-todo-app.js';

export type AppProps = {
  authentication: BootstrapState<AuthenticationSession>;
  setAuthentication: Dispatch<SetStateAction<BootstrapState<AuthenticationSession>>>;
  transportRouting: TodoTransportRouting;
  setTransportRouting(routing: TodoTransportRouting): void;
};

export const App = ({
  authentication,
  setAuthentication,
  transportRouting,
  setTransportRouting,
}: AppProps) => {
  const app = useTodoApp({ authentication, setAuthentication });

  return (
    <main className='todo-app'>
      <AppHeader {...app.header} />
      <TransportSettings routing={transportRouting} onChange={setTransportRouting} />
      <TodoBoard {...app.dashboard} />
    </main>
  );
};
