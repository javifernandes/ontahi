/**
 * Install once in a Supabase project migration. The functions use invoker rights, so normal table
 * grants and RLS remain authoritative for endpoint selection and edge mutation.
 */
export const supabaseManyToManyRpcSql = `
create or replace function public.ontahi_selection_sql(selection jsonb)
returns text
language plpgsql
immutable
as $$
declare
  kind text := selection ->> 'kind';
  operator text := selection ->> 'operator';
  operand_sql text;
  operands_sql text;
  values_sql text;
  column_sql text;
begin
  if kind = 'all' then return 'true'; end if;
  if kind = 'none' then return 'false'; end if;
  if kind = 'not' then
    return format('not (%s)', public.ontahi_selection_sql(selection -> 'operand'));
  end if;
  if kind in ('and', 'or') then
    select string_agg(format('(%s)', public.ontahi_selection_sql(value)), ' ' || kind || ' ')
      into operands_sql
      from jsonb_array_elements(selection -> 'operands') value;
    return coalesce(operands_sql, case when kind = 'and' then 'true' else 'false' end);
  end if;

  column_sql := format('%I', selection ->> 'column');
  if operator = 'isNull' then return format('%s is null', column_sql); end if;
  if operator = 'in' then
    select string_agg(quote_literal(value #>> '{}'), ', ')
      into values_sql
      from jsonb_array_elements(selection -> 'values') value;
    return case
      when values_sql is null then 'false'
      else format('%s in (%s)', column_sql, values_sql)
    end;
  end if;
  if operator not in ('eq', 'lt', 'lte', 'gt', 'gte') then
    raise exception 'Unsupported Ontahi selection operator: %', operator;
  end if;
  operand_sql := case operator
    when 'eq' then '=' when 'lt' then '<' when 'lte' then '<='
    when 'gt' then '>' when 'gte' then '>='
  end;
  return format('%s %s %L', column_sql, operand_sql, selection ->> 'value');
end;
$$;

create or replace function public.ontahi_apply_many_to_many_relationship(command jsonb)
returns jsonb
language plpgsql
volatile
as $$
declare
  source_where text;
  target_where text;
  count_guard text;
  mutation_sql text;
  result jsonb;
begin
  if (command ->> 'version')::int <> 1 then
    raise exception 'Unsupported Ontahi relationship RPC version';
  end if;
  if command ->> 'action' not in ('link', 'unlink') then
    raise exception 'Unsupported Ontahi relationship action';
  end if;

  source_where := public.ontahi_selection_sql(command #> '{source,selection}');
  target_where := public.ontahi_selection_sql(command #> '{target,selection}');
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
      || 'select source_value, target_value from selected_sources cross join selected_targets, counts '
      || 'where %s on conflict do nothing returning %I as source_value, %I as target_value',
      command #>> '{edge,table}', command #>> '{edge,sourceColumn}',
      command #>> '{edge,targetColumn}', count_guard,
      command #>> '{edge,sourceColumn}', command #>> '{edge,targetColumn}'
    );
  else
    mutation_sql := format(
      'delete from %I edge using selected_sources, selected_targets, counts '
      || 'where edge.%I = source_value and edge.%I = target_value and %s '
      || 'returning edge.%I as source_value, edge.%I as target_value',
      command #>> '{edge,table}', command #>> '{edge,sourceColumn}',
      command #>> '{edge,targetColumn}', count_guard,
      command #>> '{edge,sourceColumn}', command #>> '{edge,targetColumn}'
    );
  end if;

  execute format(
    'with selected_sources as ('
    || 'select distinct %I as source_value from %I where %s'
    || '), selected_targets as ('
    || 'select distinct %I as target_value from %I where %s'
    || '), counts as ('
    || 'select (select count(*)::int from selected_sources) as source_count, '
    || '(select count(*)::int from selected_targets) as target_count'
    || '), mutation as (%s) '
    || 'select jsonb_build_object('
    || '''sourceCount'', source_count, ''targetCount'', target_count, ''changed'', '
    || 'coalesce((select jsonb_agg(jsonb_build_object(''source'', source_value, ''target'', target_value)) '
    || 'from mutation), ''[]''::jsonb)) from counts',
    command #>> '{source,column}', command #>> '{source,table}', source_where,
    command #>> '{target,column}', command #>> '{target,table}', target_where,
    mutation_sql
  ) into result;

  return result;
end;
$$;
`;
