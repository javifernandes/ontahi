import { supabaseRelationshipConstraintRpcSql } from './relationship-constraint-rpc-sql.js';

/**
 * Install once in a Supabase project migration. The functions use invoker rights, so normal table
 * grants and RLS remain authoritative for endpoint selection and edge mutation.
 */
export const supabaseManyToManyRpcSql = `
${supabaseRelationshipConstraintRpcSql}

create or replace function public.ontahi_apply_many_to_many_relationship(command jsonb)
returns jsonb
language plpgsql
volatile
as $$
declare
  source_where text;
  target_where text;
  count_guard text;
  participant_lock text := '';
  constraint_sql jsonb;
  mutation_sql text;
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
  if command ->> 'action' = 'link' then participant_lock := ' for share'; end if;
  constraint_sql := public.ontahi_relation_constraints_sql(
    case when command ->> 'action' = 'link' then command -> 'constraints' else '[]'::jsonb end
  );
  count_guard := format(
    '%s and %s',
    case when command #> '{source,expectedCount}' is null then 'true'
      else format('source_count = %s', (command #>> '{source,expectedCount}')::int) end,
    case when command #> '{target,expectedCount}' is null then 'true'
      else format('target_count = %s', (command #>> '{target,expectedCount}')::int) end
  );

  if command ->> 'action' = 'link' then
    mutation_sql := format(
      'insert into %I (%I, %I) '
      || 'select source_value, target_value from selected_sources cross join selected_targets, guarded_counts '
      || 'where %s and constraint_rejection is null '
      || 'on conflict do nothing returning %I as source_value, %I as target_value',
      command #>> '{edge,table}', command #>> '{edge,sourceColumn}',
      command #>> '{edge,targetColumn}', count_guard,
      command #>> '{edge,sourceColumn}', command #>> '{edge,targetColumn}'
    );
  else
    mutation_sql := format(
      'delete from %I edge using selected_sources, selected_targets, guarded_counts '
      || 'where edge.%I = source_value and edge.%I = target_value '
      || 'and %s and constraint_rejection is null '
      || 'returning edge.%I as source_value, edge.%I as target_value',
      command #>> '{edge,table}', command #>> '{edge,sourceColumn}',
      command #>> '{edge,targetColumn}', count_guard,
      command #>> '{edge,sourceColumn}', command #>> '{edge,targetColumn}'
    );
  end if;

  execute format(
    'with source_rows as materialized ('
    || 'select %I as source_value%s from %I where %s%s'
    || '), target_rows as materialized ('
    || 'select %I as target_value%s from %I where %s%s'
    || '), selected_sources as ('
    || 'select distinct source_value from source_rows'
    || '), selected_targets as ('
    || 'select distinct target_value from target_rows'
    || '), counts as ('
    || 'select (select count(*)::int from selected_sources) as source_count, '
    || '(select count(*)::int from selected_targets) as target_count%s'
    || '), guarded_counts as ('
    || 'select *, %s as constraint_rejection from counts'
    || '), mutation as (%s) '
    || 'select jsonb_build_object('
    || '''sourceCount'', source_count, ''targetCount'', target_count, '
    || '''constraintRejection'', constraint_rejection, ''changed'', '
    || 'coalesce((select jsonb_agg(jsonb_build_object(''source'', source_value, ''target'', target_value)) '
    || 'from mutation), ''[]''::jsonb)) from guarded_counts',
    command #>> '{source,column}', constraint_sql ->> 'sourceProjection',
    command #>> '{source,table}', source_where, participant_lock,
    command #>> '{target,column}', constraint_sql ->> 'targetProjection',
    command #>> '{target,table}', target_where, participant_lock,
    constraint_sql ->> 'stateProjection', constraint_sql ->> 'rejectionExpression',
    mutation_sql
  ) into result;

  return result;
end;
$$;
`;
