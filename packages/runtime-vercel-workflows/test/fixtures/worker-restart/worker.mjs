import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request(new URL(incoming.url, origin), {
      method: incoming.method,
      headers: incoming.headers,
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    });
    const response = await handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500);
    outgoing.end('Worker request failed.');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
process.env.WORKFLOW_LOCAL_BASE_URL = origin;

const require = createRequire(import.meta.url);
const { POST: flow } = require('./.well-known/workflow/v1/flow.js');
const { POST: step } = require('./.well-known/workflow/v1/step.js');
const { getWorld } = await import('workflow/runtime');
const { getRun, resumeHook } = await import('workflow/api');
const { Effect } = await import('effect');
const { storage, task } = await import('./task-host.mjs');
const { createVercelWorkflowTaskRuntime } = await import(process.env.ONTAHI_RUNTIME_URL);

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const workflow = Object.assign(
  () => {
    throw new Error('Workflows execute through the compiled Workflow endpoint.');
  },
  { workflowId: manifest.workflows['workflows/recover.ts'].recover.workflowId },
);
const runtime = createVercelWorkflowTaskRuntime({
  taskRunStore: storage,
  resolveWorkflow: () => workflow,
});

const handle = async request => {
  const { pathname } = new URL(request.url);
  if (pathname.endsWith('/flow')) return flow(request);
  if (pathname.endsWith('/step')) return step(request);
  if (pathname === '/start') {
    const ref = await Effect.runPromise(runtime.start(task, undefined));
    const source = await Effect.runPromise(storage.loadSource(ref));
    return Response.json({ ...ref, workflowRunId: source.runtime.runId });
  }
  const ref = await request.json();
  if (pathname === '/checkpoint') {
    const source = await Effect.runPromise(storage.loadSource(ref));
    const hook = await getWorld()
      .hooks.getByToken(`restart:${ref.runId}`)
      .catch(() => undefined);
    return Response.json({ checkpoint: source.checkpoint, hookReady: Boolean(hook) });
  }
  if (pathname === '/resume') {
    await resumeHook(`restart:${ref.runId}`, { resume: true });
    return Response.json({ ok: true });
  }
  if (pathname === '/result') {
    const source = await Effect.runPromise(storage.loadSource(ref));
    const providerRun = getRun(source.runtime.runId);
    const status = await providerRun.status;
    return Response.json({
      task: await Effect.runPromise(runtime.getSnapshot(ref)),
      workflowRunId: providerRun.runId,
      status,
      result: status === 'completed' ? await providerRun.returnValue : undefined,
    });
  }
  return new Response(null, { status: 404 });
};
await getWorld().start?.();
process.stdout.write(`ready ${origin}\n`);
