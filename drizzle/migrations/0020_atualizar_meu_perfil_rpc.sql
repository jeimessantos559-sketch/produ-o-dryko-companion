-- Já aplicada no banco; mantida para portabilidade do repositório.
CREATE OR REPLACE FUNCTION public.atualizar_meu_perfil(p_nome text, p_email_recuperacao text, p_avatar_url text)
 RETURNS public.profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text := nullif(trim(p_email_recuperacao), '');
  v_nome text := trim(p_nome);
  v_result public.profiles;
begin
  if v_uid is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;
  if v_nome = '' then
    raise exception 'Informe seu nome.' using errcode = '22023';
  end if;
  if v_email is not null and exists (
    select 1 from public.profiles p
    where p.ativo = true
      and p.id <> v_uid
      and lower(p.email_recuperacao) = lower(v_email)
  ) then
    raise exception 'Este e-mail já está vinculado a outro perfil.' using errcode = '23505';
  end if;
  update public.profiles
     set nome = v_nome,
         email_recuperacao = v_email,
         avatar_url = p_avatar_url
   where id = v_uid
   returning * into v_result;
  if v_result.id is null then
    raise exception 'Perfil não encontrado.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$function$;

REVOKE ALL ON FUNCTION public.atualizar_meu_perfil(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_meu_perfil(text, text, text) TO authenticated;
