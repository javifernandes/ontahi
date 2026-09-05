import { AppHeader } from './todo-app/components/AppHeader.js';
import { TodoBoard } from './todo-app/components/TodoBoard.js';
import { useTodoApp, type UseTodoAppOptions } from './todo-app/use-todo-app.js';

export type AppProps = UseTodoAppOptions;

export const App = ({ authentication, setAuthentication }: AppProps) => {
  const app = useTodoApp({ authentication, setAuthentication });

  return (
    <main className='todo-app'>
      <AppHeader {...app.header} />
      <TodoBoard {...app.dashboard} />
    </main>
  );
};
