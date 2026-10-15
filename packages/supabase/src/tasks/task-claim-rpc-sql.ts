/**
 * Install after the host-owned `public.task_runs` table. The function uses invoker rights, so
 * table grants and row-level-security policies remain authoritative for every claim.
 */
export const supabaseTaskClaimRpcSql = `
create or replace function public.ontahi_claim_task_run(command jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  claimed public.task_runs%rowtype;
  action text := command ->> 'action';
begin
  if (command ->> 'version')::int is distinct from 1 then
    raise exception 'Unsupported Ontahi Task claim RPC version';
  end if;

  if action = 'claim-interaction' then
    update public.task_runs
       set status = 'running',
           checkpoint = command -> 'checkpoint',
           updated_at = (command ->> 'updatedAt')::timestamptz
     where task_id = command ->> 'taskId'
       and run_id = command ->> 'runId'
       and status = 'waiting'
       and checkpoint #>> '{interaction,id}' = command ->> 'waitId'
     returning * into claimed;
  elsif action = 'claim-event' then
    update public.task_runs
       set status = 'running',
           checkpoint = command -> 'checkpoint',
           updated_at = (command ->> 'updatedAt')::timestamptz
     where task_id = command ->> 'taskId'
       and run_id = command ->> 'runId'
       and status = 'waiting'
       and checkpoint #>> '{eventWait,id}' = command ->> 'waitId'
     returning * into claimed;
  elsif action = 'cancel-event' then
    if command ->> 'status' is null or command ->> 'status' not in ('cancelled', 'failed') then
      raise exception 'Unsupported Ontahi Task cancellation status';
    end if;
    update public.task_runs
       set status = command ->> 'status',
           checkpoint = null,
           error = nullif(command -> 'error', 'null'::jsonb),
           completed_at = (command ->> 'updatedAt')::timestamptz,
           updated_at = (command ->> 'updatedAt')::timestamptz
     where task_id = command ->> 'taskId'
       and run_id = command ->> 'runId'
       and status = 'waiting'
       and checkpoint #>> '{eventWait,id}' = command ->> 'waitId'
     returning * into claimed;
  else
    raise exception 'Unsupported Ontahi Task claim action';
  end if;

  return case when claimed.task_id is null then null else to_jsonb(claimed) end;
end;
$$;
`;
