export const supabaseRelationshipConstraintRpcSql = `
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
    select string_agg(
      case when jsonb_typeof(value) = 'null'
        then format('%s is null', column_sql)
        else format('%s is not distinct from %L', column_sql, value #>> '{}')
      end,
      ' or '
    )
      into values_sql
      from jsonb_array_elements(selection -> 'values') value;
    return case
      when values_sql is null then 'false'
      else '(' || values_sql || ')'
    end;
  end if;
  if operator not in ('eq', 'lt', 'lte', 'gt', 'gte') then
    raise exception 'Unsupported Ontahi selection operator: %', operator;
  end if;
  if operator = 'eq' then
    return format('%s is not distinct from %L', column_sql, selection ->> 'value');
  end if;
  operand_sql := case operator
    when 'lt' then '<' when 'lte' then '<='
    when 'gt' then '>' when 'gte' then '>='
  end;
  return format('coalesce(%s %s %L, false)', column_sql, operand_sql, selection ->> 'value');
end;
$$;

create or replace function public.ontahi_relation_constraints_sql(constraints jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  constraint_item jsonb;
  constraint_index integer;
  participant text;
  participant_rows text;
  alias_sql text;
  predicate_sql text;
  source_projection text := '';
  target_projection text := '';
  state_projection text := '';
  rejection_expression text := '';
begin
  for constraint_item, constraint_index in
    select value, (ordinality - 1)::integer
      from jsonb_array_elements(coalesce(constraints, '[]'::jsonb)) with ordinality
  loop
    participant := constraint_item ->> 'participant';
    if participant not in ('source', 'target') then
      raise exception 'Unsupported Ontahi Relation constraint participant: %', participant;
    end if;
    participant_rows := participant || '_rows';
    alias_sql := format('%I', 'ontahi_constraint_' || constraint_index);
    predicate_sql := public.ontahi_selection_sql(constraint_item -> 'selection');
    if participant = 'source' then
      source_projection := source_projection || format(', (%s) as %s', predicate_sql, alias_sql);
    else
      target_projection := target_projection || format(', (%s) as %s', predicate_sql, alias_sql);
    end if;
    state_projection := state_projection || format(
      ', coalesce((select bool_and(%s) from %I), true) as %s',
      alias_sql, participant_rows, alias_sql
    );
    rejection_expression := rejection_expression || format(
      ' when not %s then %L::jsonb',
      alias_sql, (constraint_item -> 'rejection')::text
    );
  end loop;

  rejection_expression := case
    when rejection_expression = '' then 'null::jsonb'
    else 'case' || rejection_expression || ' else null::jsonb end'
  end;
  return jsonb_build_object(
    'sourceProjection', source_projection,
    'targetProjection', target_projection,
    'stateProjection', state_projection,
    'rejectionExpression', rejection_expression
  );
end;
$$;
`;
