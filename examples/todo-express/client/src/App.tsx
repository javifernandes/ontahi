import type { ModelCommandResponder, ModelCommandSubmitter } from './model-commands.js';
import { AppHeader } from './todo-app/components/AppHeader.js';
import { CommandChat } from './todo-app/components/CommandChat.js';
import { TodoBoard } from './todo-app/components/TodoBoard.js';
import { useTodoApp, type UseTodoAppOptions } from './todo-app/use-todo-app.js';

export type AppProps = UseTodoAppOptions & {
  submitModelCommand?: ModelCommandSubmitter;
  respondToModelCommand?: ModelCommandResponder;
};

export const App = ({
  authentication,
  setAuthentication,
  submitModelCommand,
  respondToModelCommand,
}: AppProps) => {
  const app = useTodoApp({ authentication, setAuthentication });

  return (
    <main className='todo-app'>
      <AppHeader {...app.header} />
      <TodoBoard {...app.dashboard} />
      {app.commandChat.enabled && (
        <CommandChat
          onExecuted={app.commandChat.refresh}
          submit={submitModelCommand}
          respond={respondToModelCommand}
        />
      )}
    </main>
  );
};
