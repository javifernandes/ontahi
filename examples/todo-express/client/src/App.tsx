import { AppHeader } from './todo-app/components/AppHeader.js';
import { Organizer } from './todo-app/components/Organizer.js';
import { TodoPanel } from './todo-app/components/TodoPanel.js';
import { useTodoApp } from './todo-app/use-todo-app.js';

export const App = () => {
  const app = useTodoApp();

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
