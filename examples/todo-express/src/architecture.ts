import {
  createInMemoryDataGraphRuntime,
  type InMemoryDataGraphError,
  type InMemoryDataset,
} from '@ontahi/core/data-graph';
import {
  architecture,
  createDataGraphArchitectureAdapter,
  createInMemoryTaskRunStore,
  createInProcessTaskRuntimeAdapter,
} from '@ontahi/core/runtime/server';

export const todoDataset: InMemoryDataset = { Todo: [] };

const graph = createDataGraphArchitectureAdapter<unknown, InMemoryDataGraphError>({
  createRuntime: () => createInMemoryDataGraphRuntime({ dataset: todoDataset }),
});

const taskRunStore = createInMemoryTaskRunStore();

export const todoArchitecture = architecture({
  graph,
  task: {
    adapter: createInProcessTaskRuntimeAdapter({ store: taskRunStore }),
  },
  layers: {
    todos: {
      concerns: [graph.withRuntime()],
    },
  },
});

export const app = todoArchitecture.app;
