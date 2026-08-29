import type { TodoAppModel } from '../use-todo-app.js';

const ExpressMark = () => (
  <svg aria-hidden='true' viewBox='0 0 32 32'>
    <path d='M5 10h22M5 16h14M5 22h22' />
  </svg>
);

const PostgresMark = () => (
  <svg aria-hidden='true' viewBox='0 0 32 32'>
    <path d='M7 9.5C9 5.5 23 5 25 10c1.4 3.5-.5 10-4 12.5l-1.5-5c2-1.5 3-5.5 1.5-7.5M11 10c-1.5 2-1 8 2 10.5 1.2 1 2.6 1.5 4 1.5v5M13 13c1-1.5 4-1.5 5 0' />
    <circle cx='12.5' cy='9.5' r='.8' />
    <circle cx='20.5' cy='9.5' r='.8' />
  </svg>
);

const MemoryMark = () => (
  <svg aria-hidden='true' viewBox='0 0 32 32'>
    <rect x='8' y='8' width='16' height='16' rx='3' />
    <path d='M12 3v5m8-5v5m-8 16v5m8-5v5M3 12h5m-5 8h5m16-8h5m-5 8h5' />
  </svg>
);

export const AppHeader = ({ runtime, authentication, signOut }: TodoAppModel['header']) => {
  const storage = runtime.status === 'ready' ? runtime.value.storage : undefined;
  const authenticationSession =
    authentication.status === 'ready' ? authentication.value : undefined;

  return (
    <header>
      <div className='app-heading'>
        <span className='eyebrow'>Ontahi example</span>
        <h1>Todo</h1>
      </div>
      <div className='app-tools'>
        <div className='runtime-stack' aria-label={`Express with ${storage ?? 'graph runtime'}`}>
          <span>
            <ExpressMark />
            Express
          </span>
          <strong>+</strong>
          <span>
            {storage === 'in-memory' ? (
              <MemoryMark />
            ) : storage === 'postgres' ? (
              <PostgresMark />
            ) : null}
            {storage === 'in-memory'
              ? 'In-memory'
              : storage === 'postgres'
                ? 'PostgreSQL'
                : runtime.status === 'error'
                  ? 'Runtime unavailable'
                  : '…'}
          </span>
        </div>
        <a className='explorer-link' href='/explorer'>
          Explore data <span aria-hidden='true'>↗</span>
        </a>
      </div>
      <div className='auth-session'>
        {authentication.status === 'loading' ? (
          <span className='muted'>Loading authentication…</span>
        ) : authentication.status === 'error' ? (
          <span className='error'>Authentication status unavailable.</span>
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
            <button type='button' className='ghost' onClick={signOut}>
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
