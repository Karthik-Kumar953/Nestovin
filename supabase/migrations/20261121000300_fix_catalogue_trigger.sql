-- Fix: PL/pgSQL does not short-circuit `cond AND new.some_column`; referencing a
-- column that the current table lacks fails even when `cond` is false. Each
-- table-specific check is now nested inside its own table branch.

create or replace function app.tg_catalogue_draft_only() returns trigger
language plpgsql
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  ver uuid := app.catalogue_version_of(tg_table_name, rec);
  ver_status text;
  ver_community uuid;
  other_community uuid;
begin
  select status, community_id into ver_status, ver_community from app.catalogue_versions where id = ver;
  -- Cascade deletes of a whole draft version arrive with the version already gone.
  if ver_status is null then
    return coalesce(new, old);
  end if;
  if ver_status <> 'DRAFT' then
    raise exception 'Published catalogue versions cannot be changed' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Cross-community / cross-version references are impossible. Values are read
  -- from the jsonb copy so no branch touches a column its table lacks.
  if tg_table_name = 'plan_components' then
    if rec ->> 'time_window_id' is not null then
      select community_id into other_community from app.time_windows where id = (rec ->> 'time_window_id')::uuid;
      if other_community is distinct from ver_community then
        raise exception 'Time window belongs to another community' using errcode = 'check_violation';
      end if;
    end if;
  elsif tg_table_name = 'plan_component_tasks' then
    select community_id into other_community from app.service_tasks where id = (rec ->> 'service_task_id')::uuid;
    if other_community is distinct from ver_community then
      raise exception 'Task belongs to another community' using errcode = 'check_violation';
    end if;
  elsif tg_table_name in ('plan_prices', 'plan_component_prices') then
    if tg_table_name = 'plan_prices' then
      if not exists (
        select 1 from app.plans p
         where p.id = (rec ->> 'plan_id')::uuid and p.catalogue_version_id = (rec ->> 'catalogue_version_id')::uuid
      ) then
        raise exception 'Plan belongs to another catalogue version' using errcode = 'check_violation';
      end if;
    end if;
    select community_id into other_community from app.residence_categories where id = (rec ->> 'residence_category_id')::uuid;
    if other_community is distinct from ver_community then
      raise exception 'Residence category belongs to another community' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;
