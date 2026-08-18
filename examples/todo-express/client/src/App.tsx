import type { Dispatch, SetStateAction } from 'react';

import type { AuthenticationSession, BootstrapState } from './todo-app/bootstrap.js';
import { AppHeader } from './todo-app/components/AppHeader.js';
import { Organizer } from './todo-app/components/Organizer.js';
import { TodoPanel } from './todo-app/components/TodoPanel.js';
import { useTodoApp } from './todo-app/use-todo-app.js';

export type AppProps = {
  authentication: BootstrapState<AuthenticationSession>;
  setAuthentication: Dispatch<SetStateAction<BootstrapState<AuthenticationSession>>>;
};

export const App = ({ authentication, setAuthentication }: AppProps) => {
  const app = useTodoApp({ authentication, setAuthentication });

  return (
    <main className='todo-app'>
      <AppHeader {...app.header} />
      <section className='workspace'>
        <Organizer {...app.organizer} />
        <TodoPanel {...app.todoPanel} />
      </section>
    </main>
  );
};
