-- Documenta mudancas JA APLICADAS manualmente no banco (idempotente).

create or replace function public.forcar_horario_atual_apontamento()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  new.data_hora_producao := date_trunc('minute', now() at time zone 'America/Sao_Paulo');
  return new;
end;
$function$;

drop trigger if exists "00_forcar_horario_atual" on public.apontamentos;
create trigger "00_forcar_horario_atual"
before insert on public.apontamentos
for each row execute function public.forcar_horario_atual_apontamento();

create or replace function public.ajustar_horario_apontamento(p_id uuid, p_data_hora timestamp without time zone)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_ap public.apontamentos%rowtype;
  v_data date;
begin
  if not public.has_role(auth.uid(), 'administrador') then
    raise exception 'Somente o administrador pode ajustar o horario do apontamento';
  end if;
  select * into v_ap from public.apontamentos where id = p_id for update;
  if not found then raise exception 'Apontamento nao encontrado'; end if;
  if p_data_hora > (now() at time zone 'America/Sao_Paulo') + interval '5 minutes' then
    raise exception 'O horario da producao nao pode estar no futuro';
  end if;
  if not public.horario_pertence_turno(v_ap.turno, p_data_hora::time) then
    raise exception 'O horario informado nao pertence ao turno do apontamento';
  end if;
  v_data := public.data_producao_turno(v_ap.turno, p_data_hora at time zone 'America/Sao_Paulo');
  if v_data <> v_ap.data_local then
    raise exception 'O ajuste deve permanecer na mesma data operacional';
  end if;
  update public.apontamentos
  set data_hora_producao = date_trunc('minute', p_data_hora), updated_at = now()
  where id = p_id;
end;
$function$;

grant execute on function public.ajustar_horario_apontamento(uuid, timestamp without time zone) to authenticated;
