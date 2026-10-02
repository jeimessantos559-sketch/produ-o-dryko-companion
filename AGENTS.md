<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Biometria via WebAuthn verificada no servidor (src/lib/biometria.ts); tabelas webauthn_* sem policies, acesso só por service role — evita exposição de credenciais.
- Fotos de perfil em bucket privado `avatars`; profiles.avatar_url guarda o caminho e a exibição usa link temporário — buckets públicos bloqueados no workspace.

- WebAuthn verification is hand-written on WebCrypto (src/lib/webauthn.server.ts), never @simplewebauthn/server — its x509/tsyringe deps crashed the Worker at startup, taking down every page.
- Pure industrial rules (turnos, fórmulas, agrupamento Protheus em src/lib/protheus.ts, indicadores) live in src/lib and are covered by vitest (vitest.config.ts, no app plugins) — screens import them so behavior is tested once.
- Auth attempt limits persist in public.auth_tentativas (hashed keys, service_role only) via src/lib/limite-tentativas.server.ts — workers are stateless, memory counters would not hold.
- Service worker waits for the user's "Atualizar" (SKIP_WAITING message) — never reload silently mid-form. No offline queue for apontamentos until conflict rules exist; saves are blocked offline.
- CI (.github/workflows/ci.yml) runs verify:portability, tests and build without production secrets; lint is non-blocking until historical debt is fixed.
- Ocorrências abertas (hora_inicio sem hora_fim) são finalizadas/transferidas só pelas RPCs finalizar_ocorrencia/transferir_ocorrencia (lock + auditoria em ocorrencia_transferencias); regras puras espelhadas em src/lib/ocorrencias-operacionais.ts — evita corrida entre aparelhos e duplicação.
