import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; at: number }>();

/** avatar_url guarda o caminho no bucket privado "avatars"; gera link temporário para exibir. */
export function useAvatarUrl(caminho: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    if (!caminho) { setUrl(null); return; }
    if (/^https?:\/\//.test(caminho)) { setUrl(caminho); return; }
    const salvo = cache.get(caminho);
    if (salvo && Date.now() - salvo.at < 50 * 60_000) { setUrl(salvo.url); return; }
    void supabase.storage.from("avatars").createSignedUrl(caminho, 3600).then(({ data }) => {
      if (!ativo || !data?.signedUrl) return;
      cache.set(caminho, { url: data.signedUrl, at: Date.now() });
      setUrl(data.signedUrl);
    });
    return () => { ativo = false; };
  }, [caminho]);
  return url;
}
