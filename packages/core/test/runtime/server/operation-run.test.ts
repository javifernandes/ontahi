import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureServerRuntime,
  createOperationFailure,
  event,
  ExternalDependencyFailedError,
  PersistenceFailedError,
  RateLimitExceededError,
  resetServerRuntimeForTests,
  run,
  runServerOperation,
  withEffects,
} from '../../../src/runtime/server/index.js';

const createTelemetry = () => ({
  withSpan: vi.fn(async (_name, _options, fn) => fn({ span: true })),
  markSuccess: vi.fn(),
  markFailure: vi.fn(),
  getRuntimeAttributes: vi.fn(input => ({ scope: input.scope, runtime: input.runtime })),
});

const createReporting = () => ({
  reportError: vi.fn(),
  reportWarning: vi.fn(),
});

describe('runServerOperation', () => {
  afterEach(() => {
    resetServerRuntimeForTests();
  });

  it('serializes successful object and void results', async () => {
    await expect(
      runServerOperation(Effect.succeed({ title: 'Progbook' }), {
        scope: 'features.books.fetchBook',
        defectLogMessage: 'Unexpected failure',
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        title: 'Progbook',
      },
    });
    await expect(
      runServerOperation(Effect.void, {
        scope: 'features.books.touchBook',
        defectLogMessage: 'Unexpected failure',
      }),
    ).resolves.toEqual({
      success: true,
    });
  });

  it('executes success payload effects before returning success', async () => {
    const telemetry = createTelemetry();
    const reporting = createReporting();
    const publishEvent = vi.fn(() => Effect.void);
    const runEffect = vi.fn();
    configureServerRuntime({
      telemetry,
      reporting,
      loadArchitecture: async () => ({
        effectors: {
          'emit-event': publishEvent,
        },
      }),
    });

    await expect(
      runServerOperation(
        Effect.succeed(
          withEffects({ documentCount: 1 }, [
            run(Effect.sync(runEffect)),
            event({ type: 'BookSearchIndexRefreshed' }),
          ]),
        ),
        {
          scope: 'features.bookSearch.reindex',
          defectLogMessage: 'Unexpected failure',
        },
      ),
    ).resolves.toEqual({
      success: true,
      data: {
        documentCount: 1,
      },
    });
    expect(runEffect).toHaveBeenCalledTimes(1);
    expect(publishEvent).toHaveBeenCalledWith({
      kind: 'emit-event',
      event: { type: 'BookSearchIndexRefreshed' },
    });
    expect(telemetry.markSuccess).toHaveBeenCalled();
  });

  it('serializes business failures and rate-limit failures', async () => {
    await expect(
      runServerOperation(Effect.fail(createOperationFailure('not_found', 'Book was not found.')), {
        scope: 'features.books.fetchBook',
        defectLogMessage: 'Unexpected failure',
      }),
    ).resolves.toEqual({
      success: false,
      reason: 'not_found',
      message: 'Book was not found.',
      error: 'Book was not found.',
      errorType: 'not_found',
    });
    await expect(
      runServerOperation(
        Effect.fail(new RateLimitExceededError({ message: 'Too many reads.', remaining: 0 })),
        {
          scope: 'features.books.fetchBook',
          defectLogMessage: 'Unexpected failure',
        },
      ),
    ).resolves.toEqual({
      success: false,
      reason: 'rate_limited',
      message: 'Too many reads.',
      error: 'Too many reads.',
      errorType: 'rate_limited',
      status: 429,
    });
  });

  it('reports and serializes expected server operation errors', async () => {
    const reporting = createReporting();
    configureServerRuntime({ reporting });
    const persistenceError = new PersistenceFailedError({
      message: 'Could not load book.',
      logMessage: 'Database failed while loading book',
      cause: new Error('db down'),
      scope: 'features.books.fetchBook',
      extra: { bookSlug: 'progbook' },
    });
    const externalError = new ExternalDependencyFailedError({
      message: 'Could not send email.',
      logMessage: 'Email provider failed',
      cause: new Error('smtp down'),
      scope: 'features.sharing.invite',
    });

    await expect(
      runServerOperation(Effect.fail(persistenceError), {
        scope: 'features.books.fetchBook',
        defectLogMessage: 'Unexpected failure',
      }),
    ).resolves.toEqual({
      success: false,
      reason: 'persistence_failed',
      message: 'Could not load book.',
      error: 'Could not load book.',
      errorType: 'persistence_failed',
    });
    await expect(
      runServerOperation(Effect.fail(externalError), {
        scope: 'features.sharing.invite',
        defectLogMessage: 'Unexpected failure',
      }),
    ).resolves.toMatchObject({
      success: false,
      reason: 'external_dependency_failed',
      message: 'Could not send email.',
    });
    expect(reporting.reportError).toHaveBeenCalledWith(
      'Database failed while loading book',
      persistenceError.cause,
      {
        scope: 'features.books.fetchBook',
        extra: { bookSlug: 'progbook' },
      },
    );
  });

  it('reports unexpected defects as internal errors', async () => {
    const reporting = createReporting();
    configureServerRuntime({ reporting });

    const result = await runServerOperation(Effect.die(new Error('boom')), {
      scope: 'features.books.fetchBook',
      defectLogMessage: 'Unexpected book failure',
      defectPublicMessage: 'Failed to load book',
      extra: { bookSlug: 'progbook' },
    });

    expect(result).toMatchObject({
      success: false,
      reason: 'internal_error',
      message: 'Failed to load book',
      error: 'Failed to load book',
      errorType: 'internal_error',
    });
    expect(result).not.toHaveProperty('cause');
    expect(reporting.reportError).toHaveBeenCalledWith(
      'Unexpected book failure',
      expect.any(Error),
      {
        scope: 'features.books.fetchBook',
        extra: expect.objectContaining({
          bookSlug: 'progbook',
          defectCause: expect.stringContaining('boom'),
        }),
      },
    );
  });

  it('exposes JSON-safe internal error causes only when diagnostics opt in', async () => {
    const relationError = new Error('Relation Trip.driver is missing mapping metadata.');
    const readError = new Error('Failed to execute in-memory read.');
    Object.defineProperty(readError, 'cause', {
      configurable: true,
      value: relationError,
    });
    configureServerRuntime({
      diagnostics: {
        exposeInternalErrorCauses: true,
      },
    });

    const result = await runServerOperation(Effect.die(readError), {
      scope: 'Trip.list',
      defectLogMessage: 'Unexpected trip read failure',
      defectPublicMessage: 'Failed to load trips',
    });
    const transported = JSON.parse(JSON.stringify(result));

    expect(transported).toMatchObject({
      success: false,
      reason: 'internal_error',
      message: 'Failed to load trips',
      cause: {
        name: 'Error',
        message: 'Failed to execute in-memory read.',
        cause: {
          name: 'Error',
          message: 'Relation Trip.driver is missing mapping metadata.',
        },
      },
    });
  });
});
