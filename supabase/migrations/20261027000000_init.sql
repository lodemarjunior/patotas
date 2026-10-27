-- Patotas: esquema inicial. Cada tesoureiro (auth.users) enxerga apenas os próprios dados.

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  monthly numeric(12,2) not null default 0 check (monthly >= 0),
  fine_value numeric(12,2) not null default 0 check (fine_value >= 0),
  uses_fines boolean not null default true,
  theme text not null default 'light' check (theme in ('light','dark'))
);

create table public.month_settings (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  monthly numeric(12,2) not null check (monthly >= 0),
  fine_value numeric(12,2) not null check (fine_value >= 0),
  uses_fines boolean not null,
  primary key (user_id, month)
);

create table public.members (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  exempt boolean not null default false,
  unique (id, user_id)
);
create index members_user_month_idx on public.members (user_id, month);

create table public.dues (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  member_id bigint not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_at date,
  unique (member_id),
  foreign key (member_id, user_id) references public.members (id, user_id) on delete cascade
);

create table public.fines (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  member_id bigint not null,
  quantity integer not null check (quantity between 1 and 1000),
  unit_amount numeric(12,2) not null check (unit_amount > 0),
  reason text not null default '',
  occurred_at date,
  paid_at date,
  foreign key (member_id, user_id) references public.members (id, user_id) on delete cascade
);
create index fines_member_idx on public.fines (member_id);

-- Isento não tem mensalidade: marcar apaga a existente e impede nova.
create function public.members_exempt_clears_due() returns trigger
language plpgsql as $$
begin
  if new.exempt and not old.exempt then
    delete from public.dues where member_id = new.id;
  end if;
  return new;
end $$;
create trigger members_exempt_clears_due after update of exempt on public.members
  for each row execute function public.members_exempt_clears_due();

create function public.dues_reject_exempt() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.members m where m.id = new.member_id and m.exempt) then
    raise exception 'Membro isento não tem mensalidade' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger dues_reject_exempt before insert or update on public.dues
  for each row execute function public.dues_reject_exempt();

alter table public.settings enable row level security;
alter table public.month_settings enable row level security;
alter table public.members enable row level security;
alter table public.dues enable row level security;
alter table public.fines enable row level security;

create policy own_rows on public.settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.month_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.members for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.dues for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.fines for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Copia só os nomes; mês de destino precisa estar vazio (atômico).
create function public.copy_members(source_month text, target_month text) returns integer
language plpgsql security invoker as $$
declare n integer;
begin
  if source_month = target_month then
    raise exception 'Mês de origem inválido' using errcode = '22023';
  end if;
  if exists (select 1 from public.members where month = target_month) then
    raise exception 'Este mês já possui membros cadastrados' using errcode = '23505';
  end if;
  insert into public.members (month, name)
    select target_month, name from public.members where month = source_month order by id;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Mês de origem inválido' using errcode = '22023';
  end if;
  return n;
end $$;

-- Cria membro com mensalidade e multas iniciais numa única transação.
create function public.create_member(
  p_month text, p_name text, p_exempt boolean,
  p_due_amount numeric, p_due_paid_at date, p_fines jsonb
) returns bigint
language plpgsql security invoker as $$
declare mid bigint; f jsonb;
begin
  insert into public.members (month, name, exempt) values (p_month, btrim(p_name), p_exempt)
    returning id into mid;
  if not p_exempt then
    insert into public.dues (member_id, amount, paid_at) values (mid, p_due_amount, p_due_paid_at);
  end if;
  for f in select * from jsonb_array_elements(coalesce(p_fines, '[]'::jsonb)) loop
    insert into public.fines (member_id, quantity, unit_amount, reason, occurred_at, paid_at)
    values (mid, (f->>'quantity')::int, (f->>'unit_amount')::numeric,
            coalesce(f->>'reason',''), (f->>'occurred_at')::date, nullif(f->>'paid_at','')::date);
  end loop;
  return mid;
end $$;

revoke all on all tables in schema public from anon;
revoke execute on function public.copy_members, public.create_member from public, anon;
grant execute on function public.copy_members, public.create_member to authenticated;
