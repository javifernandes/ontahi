/**
 * Install once in a Supabase project migration. The functions use invoker rights, so normal table
 * grants and RLS remain authoritative for endpoint selection and Relation mutation.
 */
export const supabaseRelationshipRpcSql = `
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
    || 'select %I as old_target from %I where %s for update'
    || '), target_rows as materialized ('
    || 'select 1 from %I where %s'
    || '), state as ('
    || 'select (select count(*)::int from source_rows) as source_count, '
    || '(select count(*)::int from target_rows) as target_count, '
    || '(select old_target from source_rows limit 1) as old_target'
    || '), updated as ('
    || 'update %I set %I = %L where %s '
    || 'and (select source_count = 1 and %s and %s from state) returning 1'
    || ') select jsonb_build_object('
    || '''sourceCount'', source_count, ''targetCount'', target_count, '
    || '''oldTarget'', to_jsonb(old_target), ''preconditionMatched'', %s, '
    || '''changed'', (select count(*) = 1 from updated)) from state',
    command ->> 'relationColumn', command #>> '{source,table}', source_where,
    command #>> '{target,table}', target_where,
    command #>> '{source,table}', command ->> 'relationColumn', command ->> 'nextTarget',
    source_where, target_guard, expected_guard, expected_result
  ) into result;

  return result;
end;
$$;
`;
