import { createTodoExpressServer } from './application.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);

createTodoExpressServer().listen(port, () => {
  process.stdout.write(`Ontahi todo example listening on http://localhost:${port}\n`);
});
