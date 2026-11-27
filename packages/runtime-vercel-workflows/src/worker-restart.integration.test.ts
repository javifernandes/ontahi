import { execFile, spawn } from 'node:child_process';
import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, it, vi } from 'vitest';

const execute = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../', import.meta.url));

it.each(['persisted hook', 'external write in flight'] as const)(
  'recovers the same Workflow and Ontahí run after worker death at %s',
  async scenario => {
    const directory = await mkdtemp(join(tmpdir(), 'ontahi-vercel-restart-'));
    const provider = scenario === 'external write in flight' ? await createProvider() : undefined;
    const env = {
      ...process.env,
      FIXTURE_PROVIDER_URL: provider?.origin,
      WORKFLOW_TARGET_WORLD: 'local',
      WORKFLOW_LOCAL_DATA_DIR: join(directory, 'workflow-data'),
      ONTAHI_EXECUTOR_URL: new URL('../dist/executor.js', import.meta.url).href,
      ONTAHI_RUNTIME_URL: new URL('../dist/runtime.js', import.meta.url).href,
    };
    const workers: ReturnType<typeof launch>[] = [];
    const start = async () => {
      const worker = launch(directory, env);
      workers.push(worker);
      return { ...worker, origin: await worker.ready };
    };

    try {
      await cp(join(packageRoot, 'test/fixtures/worker-restart'), directory, { recursive: true });
      await writeFile(join(directory, 'package.json'), '{"private":true}');
      await symlink(join(packageRoot, 'node_modules'), join(directory, 'node_modules'), 'dir');
      await execute(
        join(packageRoot, 'node_modules/.bin/workflow'),
        ['build', '--workflow-manifest', 'manifest.json'],
        {
          cwd: directory,
          env,
          timeout: 30_000,
        },
      );

      const first = await start();
      const ref = (await request(first.origin, '/start')) as {
        taskId: string;
        runId: string;
        workflowRunId: string;
      };
      expect(ref).toMatchObject({
        taskId: 'Fixture.recover',
        runId: expect.any(String),
        workflowRunId: expect.any(String),
      });
      await vi.waitFor(
        async () => {
          expect(await request(first.origin, '/checkpoint', ref)).toMatchObject({
            hookReady: true,
            checkpoint: {
              state: { step: 'resume', token: 'saved-value', writtenByPid: first.child.pid },
            },
          });
        },
        { timeout: 15_000 },
      );

      if (provider) {
        await request(first.origin, '/resume', ref);
        await vi.waitFor(
          () => {
            expect(provider.writes()).toBe(1);
            expect(provider.committed.size).toBe(1);
          },
          { timeout: 15_000 },
        );
      }
      expect(first.child.kill('SIGKILL')).toBe(true);
      expect(await first.exited).toMatchObject({ signal: 'SIGKILL' });
      const second = await start();
      expect(second.child.pid).not.toBe(first.child.pid);
      if (!provider) {
        expect(await request(second.origin, '/checkpoint', ref)).toMatchObject({
          hookReady: true,
          checkpoint: { state: { writtenByPid: first.child.pid } },
        });
        await request(second.origin, '/resume', ref);
      }
      const recovered = {
        step: 'resume',
        token: 'saved-value',
        writtenByPid: first.child.pid,
        resumedByPid: second.child.pid,
        ...(provider ? { customer: { id: 'customer-1', name: 'Ada' } } : {}),
      };
      await vi.waitFor(
        async () => {
          expect(await request(second.origin, '/result', ref)).toMatchObject({
            workflowRunId: ref.workflowRunId,
            status: 'completed',
            result: recovered,
            task: { taskId: ref.taskId, runId: ref.runId, status: 'completed', result: recovered },
          });
        },
        { timeout: 20_000 },
      );
      if (provider) {
        expect(provider.writes()).toBe(1);
        expect(provider.committed.size).toBe(1);
      }
    } finally {
      await Promise.all(
        workers.map(worker => {
          worker.child.kill('SIGKILL');
          return worker.exited;
        }),
      );
      await provider?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  75_000,
);

const createProvider = async () => {
  const committed = new Map<string, object>();
  let writes = 0;
  const server = createServer(async (request, response) => {
    const reference = request.url ?? '';
    if (request.method === 'POST') {
      let payload = '';
      for await (const chunk of request.setEncoding('utf8')) payload += chunk;
      writes += 1;
      committed.set(reference, JSON.parse(payload) as object);
      // Keep the HTTP call in flight after committing. The worker process is killed before a reply.
      return;
    }
    const customer = committed.get(reference);
    response.writeHead(customer ? 200 : 404, { 'content-type': 'application/json' });
    response.end(JSON.stringify(customer ? { ...customer, id: 'customer-1' } : {}));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    committed,
    writes: () => writes,
    close: () =>
      new Promise<void>(resolve => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
};

const request = async (origin: string, path: string, body?: unknown) => {
  const response = await fetch(new URL(path, origin), {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok)
    throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  return response.json();
};

const launch = (cwd: string, env: NodeJS.ProcessEnv) => {
  const child = spawn(process.execPath, ['--conditions=react-server', 'worker.mjs'], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', chunk => {
    diagnostics += String(chunk);
  });
  const exited = new Promise<{ signal: NodeJS.Signals | null }>(resolve => {
    child.once('exit', (_code, signal) => resolve({ signal }));
    child.once('error', () => resolve({ signal: null }));
  });
  const ready = new Promise<string>((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error(`Worker startup timed out: ${diagnostics}`)),
      15_000,
    );
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      if (!line.startsWith('ready ')) return;
      clearTimeout(deadline);
      resolve(line.slice('ready '.length));
    });
    void exited.then(() => {
      clearTimeout(deadline);
      lines.close();
      reject(new Error(`Worker stopped before readiness: ${diagnostics}`));
    });
  });
  return { child, ready, exited };
};
