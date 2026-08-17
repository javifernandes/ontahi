import type { TodoAppModel } from '../use-todo-app.js';

type TodoActionsProps = Pick<TodoAppModel['todoPanel'], 'actions' | 'durableRun'>;

export const TodoActions = ({ actions, durableRun }: TodoActionsProps) => (
  <>
    <footer>
      <button
        type='button'
        className='secondary'
        disabled={!actions.canComplete || !actions.hasSelectedTodos || actions.isCompleting}
        onClick={actions.completeSelected}
        title={actions.canComplete ? undefined : 'Sign in with GitHub first.'}
      >
        Complete selected
      </button>
      <button
        type='button'
        className='secondary'
        disabled={!actions.canComplete || !actions.hasVisibleTodos || actions.isCompleting}
        onClick={actions.completeVisible}
        title={actions.canComplete ? undefined : 'Sign in with GitHub first.'}
      >
        Complete visible
      </button>
      <button
        type='button'
        className='secondary'
        disabled={!actions.hasSelectedTag || !actions.hasSelectedTodos || actions.isAssigningTags}
        onClick={actions.assignTag}
      >
        Assign tag
      </button>
      <button
        type='button'
        className='ghost'
        disabled={!actions.hasSelectedTag || !actions.hasSelectedTodos || actions.isRemovingTags}
        onClick={actions.removeTag}
      >
        Remove tag
      </button>
      <button
        type='button'
        className='ghost'
        disabled={durableRun.isExecuting}
        onClick={actions.completeAll}
      >
        Complete all durably
      </button>
      <button
        type='button'
        className='danger'
        disabled={!actions.hasVisibleTodos || actions.isDeletingAll}
        onClick={actions.deleteAll}
      >
        Delete all
      </button>
    </footer>

    {durableRun.value && (
      <div className='run' aria-live='polite'>
        <span>Run {durableRun.value.runId}</span>
        {durableRun.isQueued && <strong>Queued…</strong>}
        {durableRun.isRunning && (
          <strong>
            {durableRun.progress?.phase === 'updating' ? 'Completing todos…' : 'Running…'}
          </strong>
        )}
        {durableRun.isCompleted && (
          <strong>Completed {durableRun.finalValue?.completed ?? 0} todos.</strong>
        )}
        {durableRun.isFailed && (
          <strong className='error'>{durableRun.error?.message ?? 'Run failed.'}</strong>
        )}
        {durableRun.isCancelled && <strong>Cancelled.</strong>}
      </div>
    )}
  </>
);
