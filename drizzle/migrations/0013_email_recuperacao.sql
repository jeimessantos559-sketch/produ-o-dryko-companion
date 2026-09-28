alter table public.profiles add column if not exists email_recuperacao text;

create unique index if not exists profiles_email_recuperacao_unique_idx
  on public.profiles (lower(email_recuperacao))
  where email_recuperacao is not null and ativo = true;

create or replace function public.concluir_primeiro_acesso(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida';
  end if;

  if v_email is null or v_email = '' or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'E-mail de recuperacao invalido';
  end if;

  if exists (
    select 1
    from public.profiles
    where id <> auth.uid()
      and ativo = true
      and lower(email_recuperacao) = v_email
  ) then
    raise exception 'Este e-mail ja esta vinculado a outro usuario';
  end if;

  update public.profiles
  set email_recuperacao = v_email,
      deve_alterar_senha = false,
      updated_at = now()
  where id = auth.uid() and ativo = true;

  if not found then
    raise exception 'Usuario ativo nao encontrado';
  end if;
end;
$$;

grant execute on function public.concluir_primeiro_acesso(text) to authenticated;
