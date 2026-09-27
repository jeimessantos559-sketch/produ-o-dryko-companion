export function normalizarLogin(valor: string) {
  return valor
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "");
}

export function aliasDoNome(nome: string) {
  const partes = nome
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((parte) => parte.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes[0]}.${partes.at(-1)}`;
}

export function emailInternoDoLogin(login: string) {
  return `${normalizarLogin(login)}@aponta-producao.invalid`;
}
