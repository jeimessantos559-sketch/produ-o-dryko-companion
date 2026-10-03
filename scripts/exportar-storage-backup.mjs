import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { createClient } from "@supabase/supabase-js";

const destino = process.argv[2];
const url = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!destino || !url || !serviceRole) {
  throw new Error("Destino, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
}

const raiz = resolve(destino);
const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const buckets = ["avatars", "problemas"];

function caminhoSeguro(bucket, caminho) {
  const alvo = resolve(raiz, bucket, caminho);
  const pastaBucket = `${resolve(raiz, bucket)}${sep}`;
  if (!alvo.startsWith(pastaBucket)) throw new Error("Caminho inseguro retornado pelo Storage.");
  return alvo;
}

async function exportarPasta(bucket, prefixo = "") {
  const limite = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefixo, {
      limit: limite,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Falha ao listar ${bucket}/${prefixo}: ${error.message}`);

    for (const item of data ?? []) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
      const ehPasta = item.id === null;
      if (ehPasta) {
        await exportarPasta(bucket, caminho);
        continue;
      }

      const { data: arquivo, error: erroDownload } = await supabase.storage
        .from(bucket)
        .download(caminho);
      if (erroDownload || !arquivo) {
        throw new Error(
          `Falha ao baixar ${bucket}/${caminho}: ${erroDownload?.message ?? "arquivo vazio"}`,
        );
      }
      const alvo = caminhoSeguro(bucket, caminho);
      await mkdir(dirname(alvo), { recursive: true });
      await writeFile(alvo, new Uint8Array(await arquivo.arrayBuffer()));
    }

    if (!data || data.length < limite) break;
    offset += limite;
  }
}

for (const bucket of buckets) {
  await mkdir(resolve(raiz, bucket), { recursive: true });
  await exportarPasta(bucket);
}

console.log(`Storage exportado: ${buckets.join(", ")}.`);
