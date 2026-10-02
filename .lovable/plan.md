# Organizar texto de ocorrências

## Implementação
- Ajustar somente o gerador de texto compartilhado para agrupar ocorrências por equipamento, respeitando a ordem operacional existente.
- Ordenar cada grupo pela hora inicial, com fallback para a data de criação.
- Formatar ocorrências como bullets compactos, separar ocorrências gerais e exibir o total parado ao final de cada equipamento apenas quando positivo.
- Preservar os títulos estruturados de Corte/Fitas e o formato livre dos demais setores.
- Manter preview, cópia e WhatsApp usando a mesma saída compartilhada.

## Testes e validação
- Atualizar testes unitários para totais, ordem cronológica, andamento, motivo/ação, Mantas e “Sem ocorrências”.
- Rodar TypeScript, testes, verificação de portabilidade e build.
- Não alterar banco, regras operacionais, PDF/e-mail ou publicação.
