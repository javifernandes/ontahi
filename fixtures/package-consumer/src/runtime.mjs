import { createInMemoryDataGraphStorage, field, graphSchema } from '@ontahi/core/data-graph';
import { entity, ontahi } from '@ontahi/core/runtime/server';
import { ontahiExpress } from '@ontahi/runtime-express';
import express from 'express';

const TodoList = entity({
  name: 'TodoList',
  fields: {
    id: field.id(),
    name: field.nonEmptyString({ trim: true }),
  },
  operations: ({ self, commands, operation }) => ({
    list: operation({
      output: self.array(),
      run: () => commands.all().orderBy(list => list.name),
    }),
    rename: operation({
      input: graphSchema.object({
        list: self.one(),
        name: self.fields.name,
      }),
      output: self,
      run: ({ list, name }) => list.updateReturning({ name }, ['id', 'name']),
    }),
  }),
});

const dataset = {
  TodoList: [{ id: 'list-research', name: 'Research backlog' }],
};
const application = ontahi({
  storage: createInMemoryDataGraphStorage({ dataset }),
  entities: [TodoList],
});

const listed = await TodoList.list();
const renamed = await TodoList.rename({
  list: TodoList.refById('list-research'),
  name: 'Research queue',
});

if (!listed.ok || listed.value.length !== 1 || !renamed.ok) {
  throw new Error('Packed Core failed the in-memory Todo smoke.');
}

const server = express().use('/runtime/ontahi', ontahiExpress(application)).listen(0, '127.0.0.1');

try {
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Packed Express runtime did not expose a TCP address.');
  }

  const response = await fetch(`http://127.0.0.1:${address.port}/runtime/ontahi/application`);
  const description = await response.json();

  if (!response.ok || description.entities?.[0]?.name !== 'TodoList') {
    throw new Error('Packed Express runtime failed its mount smoke.');
  }
} finally {
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  );
}
