import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EmDefinicao({
  titulo,
  descricao,
  itens,
}: {
  titulo: string;
  descricao: string;
  itens?: string[];
}) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>{descricao}</p>
        {itens && itens.length > 0 && (
          <ul className="list-disc space-y-1 pl-5">
            {itens.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
