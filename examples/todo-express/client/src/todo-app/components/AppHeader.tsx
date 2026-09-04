import { Boxes, CheckCheck, Database, LogOut, MemoryStick } from 'lucide-react';

import type { TodoAppModel } from '../use-todo-app.js';

export const AppHeader = ({
  runtime,
  authentication,
  signOut,
  canComplete,
  completeAllTodos,
  completeAll,
}: TodoAppModel['header']) => {
  const storage = runtime.status === 'ready' ? runtime.value.storage : undefined;
  const authenticationSession =
    authentication.status === 'ready' ? authentication.value : undefined;

  return (
    <header className='app-header'>
      <div className='app-brand'>
        <span className='brand-mark'>
          <Boxes aria-hidden='true' />
        </span>
        <div className='app-heading'>
          <span className='eyebrow'>Ontahi example</span>
          <h1>Todo</h1>
        </div>
      </div>

      <div className='app-tools'>
        <button
          type='button'
          className='text-button auth-action'
          disabled={!canComplete || completeAll.isExecuting}
          onClick={() => void completeAllTodos()}
        >
          <CheckCheck aria-hidden='true' />
          {completeAll.isQueued || completeAll.isRunning ? 'Completing…' : 'Complete all'}
        </button>
        <span className='muted' aria-live='polite'>
          {completeAll.isRunning && completeAll.progress?.phase === 'updating'
            ? 'Durable progress: updating todos'
            : completeAll.isCompleted && completeAll.finalValue
              ? `Completed ${completeAll.finalValue.completed} todos`
              : ''}
        </span>
        <span className='runtime-chip' aria-label={`Express with ${storage ?? 'graph runtime'}`}>
          {storage === 'in-memory' ? (
            <MemoryStick aria-hidden='true' />
          ) : (
            <Database aria-hidden='true' />
          )}
          Express ·{' '}
          {storage === 'in-memory'
            ? 'Memory'
            : storage === 'postgres'
              ? 'PostgreSQL'
              : runtime.status === 'error'
                ? 'Unavailable'
                : 'Loading'}
        </span>
        <a className='explorer-link' href='/explorer'>
          Data explorer <span aria-hidden='true'>↗</span>
        </a>
      </div>

      <div className='auth-session'>
        {authentication.status === 'loading' ? (
          <span className='muted'>Loading authentication…</span>
        ) : authentication.status === 'error' ? (
          <span className='error'>Authentication unavailable.</span>
        ) : authenticationSession?.authenticated ? (
          <>
            <span>
              Signed in as{' '}
              <strong>
                {authenticationSession.profile?.username ??
                  authenticationSession.profile?.displayName ??
                  authenticationSession.principal?.subject}
              </strong>
            </span>
            <button type='button' className='text-button auth-action' onClick={signOut}>
              <LogOut aria-hidden='true' />
              Sign out
            </button>
          </>
        ) : authenticationSession?.mode === 'github' ? (
          <a href='/auth/github'>Sign in with GitHub to complete todos →</a>
        ) : (
          <span className='muted'>Authentication is disabled for this run.</span>
        )}
      </div>
    </header>
  );
};
