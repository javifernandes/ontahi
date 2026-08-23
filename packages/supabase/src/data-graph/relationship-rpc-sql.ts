import { supabaseRelationshipConstraintRpcSql } from './relationship-constraint-rpc-sql.js';

/**
 * Install once in a Supabase project migration. The functions use invoker rights, so normal table
 * grants and RLS remain authoritative for endpoint selection and Relation mutation.
 */
export const supabaseRelationshipRpcSql = `
${supabaseRelationshipConstraintRpcSql}

create or replace function public.ontahi_apply_relationship(command jsonb)
returns jsonb
language plpgsql
volatile
as $$
declare
  source_where text;
  target_where text;
  expected_guard text := 'true';
  expected_result text := 'true';
  target_guard text := 'true';
  constraint_sql jsonb;
  result jsonb;
begin
  if (command ->> 'version')::int not in (1, 2) then
    raise exception 'Unsupported Ontahi relationship RPC version';
  end if;
  if command ->> 'action' not in ('link', 'unlink') then
    raise exception 'Unsupported Ontahi relationship action';
  end if;

  source_where := public.ontahi_selection_sql(command #> '{source,selection}');
  target_where := public.ontahi_selection_sql(command #> '{target,selection}');
  constraint_sql := public.ontahi_relation_constraints_sql(
    case when command ->> 'action' = 'link' then command -> 'constraints' else '[]'::jsonb end
  );
  if command ? 'expectedCurrent' then
    expected_guard := format('old_target is not distinct from %L', command ->> 'expectedCurrent');
    expected_result := format(
      'coalesce(source_count = 1 and old_target is not distinct from %L, false)',
      command ->> 'expectedCurrent'
    );
  end if;
  if command ->> 'action' = 'link' then target_guard := 'target_count = 1'; end if;

  execute format(
    'with source_rows as materialized ('
    || 'select %I as old_target%s from %I where %s for update'
    || '), target_rows as materialized ('
    || 'select 1 as endpoint%s from %I where %s for share'
    || '), state as ('
    || 'select (select count(*)::int from source_rows) as source_count, '
    || '(select count(*)::int from target_rows) as target_count, '
    || '(select old_target from source_rows limit 1) as old_target%s'
    || '), guarded_state as ('
    || 'select *, %s as constraint_rejection from state'
    || '), updated as ('
    || 'update %I set %I = %L where %s '
    || 'and (select source_count = 1 and %s and %s '
    || 'and constraint_rejection is null from guarded_state) returning 1'
    || ') select jsonb_build_object('
    || '''sourceCount'', source_count, ''targetCount'', target_count, '
    || '''oldTarget'', to_jsonb(old_target), ''preconditionMatched'', %s, '
    || '''constraintRejection'', constraint_rejection, '
    || '''changed'', (select count(*) = 1 from updated)) from guarded_state',
    command ->> 'relationColumn', constraint_sql ->> 'sourceProjection',
    command #>> '{source,table}', source_where,
    constraint_sql ->> 'targetProjection', command #>> '{target,table}', target_where,
    constraint_sql ->> 'stateProjection', constraint_sql ->> 'rejectionExpression',
    command #>> '{source,table}', command ->> 'relationColumn', command ->> 'nextTarget',
    source_where, target_guard, expected_guard, expected_result
  ) into result;

  return result;
end;
$$;
`;
