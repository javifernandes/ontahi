import { createTodoExpressServer } from './application.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const publicOrigin = process.env.TODO_PUBLIC_ORIGIN;

createTodoExpressServer({ ...(publicOrigin === undefined ? {} : { publicOrigin }) }).listen(
  port,
  () => {
    process.stdout.write(`Ontahi todo example listening on http://localhost:${port}\n`);
  },
);
