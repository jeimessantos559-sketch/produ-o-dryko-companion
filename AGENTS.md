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
