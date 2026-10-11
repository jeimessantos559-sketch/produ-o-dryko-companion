import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consultarPerfil = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_coluna: string, userId: string) => ({
          maybeSingle: () => consultarPerfil(userId),
        }),
      }),
    }),
  },
}));

import { invalidarCache } from "../cache-consultas";
import { obterPerfilUsuario } from "../perfil-cache";

function pendente() {
  let resolver!: (valor: unknown) => void;
  const promessa = new Promise((resolve) => {
    resolver = resolve;
  });
  return { promessa, resolver };
}

describe("leitura compartilhada do perfil", () => {
  beforeEach(() => {
    invalidarCache();
    consultarPerfil.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    invalidarCache();
    vi.useRealTimers();
  });

  it("autenticação e acesso simultâneos usam uma única consulta ao banco", async () => {
    const banco = pendente();
    consultarPerfil.mockReturnValue(banco.promessa);
    const contexto = obterPerfilUsuario("operador-a");
    const acesso = obterPerfilUsuario("operador-a");
    expect(consultarPerfil).toHaveBeenCalledOnce();

    const perfil = { id: "operador-a", ativo: true, nome: "Operador" };
    banco.resolver({ data: perfil, error: null });
    expect(await contexto).toEqual(perfil);
    expect(await acesso).toEqual(perfil);
    expect(await obterPerfilUsuario("operador-a")).toEqual(perfil);
    expect(consultarPerfil).toHaveBeenCalledOnce();
  });

  it("revalida após 12 segundos, mantendo o prazo atual da autenticação", async () => {
    consultarPerfil.mockResolvedValue({ data: { id: "operador-a", ativo: true }, error: null });
    await obterPerfilUsuario("operador-a");
    vi.setSystemTime(11_999);
    await obterPerfilUsuario("operador-a");
    expect(consultarPerfil).toHaveBeenCalledOnce();

    vi.setSystemTime(12_000);
    consultarPerfil.mockResolvedValue({ data: { id: "operador-a", ativo: false }, error: null });
    expect(await obterPerfilUsuario("operador-a")).toMatchObject({ ativo: false });
    expect(consultarPerfil).toHaveBeenCalledTimes(2);
  });

  it("mantém separados os dados de usuários diferentes", async () => {
    consultarPerfil.mockImplementation(async (id) => ({ data: { id }, error: null }));
    const [a, b] = await Promise.all([
      obterPerfilUsuario("operador-a"),
      obterPerfilUsuario("operador-b"),
    ]);
    expect(a?.id).toBe("operador-a");
    expect(b?.id).toBe("operador-b");
    expect(consultarPerfil).toHaveBeenCalledTimes(2);
  });

  it("refresh ignora o cache para exibir o setor recém salvo", async () => {
    consultarPerfil.mockResolvedValue({ data: { setor_atual: "corte" }, error: null });
    await obterPerfilUsuario("operador-a");
    consultarPerfil.mockResolvedValue({ data: { setor_atual: "liquidos" }, error: null });
    expect(await obterPerfilUsuario("operador-a", true)).toMatchObject({ setor_atual: "liquidos" });
    expect(consultarPerfil).toHaveBeenCalledTimes(2);
  });

  it("uma consulta antiga não sobrescreve o refresh mais recente", async () => {
    const antiga = pendente();
    consultarPerfil.mockReturnValueOnce(antiga.promessa);
    const primeira = obterPerfilUsuario("operador-a");
    consultarPerfil.mockResolvedValue({ data: { setor_atual: "asfox" }, error: null });
    await obterPerfilUsuario("operador-a", true);

    antiga.resolver({ data: { setor_atual: "corte" }, error: null });
    await primeira;
    expect(await obterPerfilUsuario("operador-a")).toMatchObject({ setor_atual: "asfox" });
  });

  it("ao sair, a resposta anterior não pode repopular o cache da sessão", async () => {
    const anterior = pendente();
    consultarPerfil.mockReturnValueOnce(anterior.promessa);
    const primeira = obterPerfilUsuario("operador-a");
    invalidarCache();
    anterior.resolver({ data: { ativo: true }, error: null });
    await primeira;

    consultarPerfil.mockResolvedValue({ data: { ativo: false }, error: null });
    expect(await obterPerfilUsuario("operador-a")).toMatchObject({ ativo: false });
    expect(consultarPerfil).toHaveBeenCalledTimes(2);
  });

  it("uma falha não fica salva no cache nem impede uma nova tentativa", async () => {
    consultarPerfil.mockResolvedValueOnce({ data: null, error: new Error("Sem conexão") });
    await expect(obterPerfilUsuario("operador-a")).rejects.toThrow("Sem conexão");
    consultarPerfil.mockResolvedValue({ data: { ativo: true }, error: null });
    expect(await obterPerfilUsuario("operador-a")).toMatchObject({ ativo: true });
    expect(consultarPerfil).toHaveBeenCalledTimes(2);
  });
});
