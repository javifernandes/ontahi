import { createHook } from 'workflow';

type RunRef = { taskId: string; runId: string };

export async function recover(ref: RunRef) {
  'use workflow';

  await checkpoint(ref);
  const hook = createHook({ token: `restart:${ref.runId}` });
  await hook;
  return restore(ref);
}

async function checkpoint(ref: RunRef) {
  'use step';

  const { writeCheckpoint } = await import('../task-host.mjs');
  await writeCheckpoint(ref);
}

async function restore(ref: RunRef) {
  'use step';

  const { restoreCheckpoint } = await import('../task-host.mjs');
  return restoreCheckpoint(ref);
}
