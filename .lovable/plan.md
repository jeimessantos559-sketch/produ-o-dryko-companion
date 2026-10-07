# Ajustar Corte e visões gerenciais

## Implementação
- Corrigir somente a apresentação do Painel do Corte: topo com metragem em m² e lista com unidades em destaque, mantendo metragem secundária e o agrupamento Protheus intacto. Fitas permanecerá sem mudanças.
- Reaproveitar a tela administrativa de Paradas e ocorrências, que já consulta ocorrências reais e calcula rankings por equipamento/motivo e tempo total; melhorar apenas a identificação visual como Pareto.
- Completar o Histórico existente com consulta agrupada por OP para Corte/Fitas e por lote para Mantas. Cada grupo abrirá os apontamentos já disponíveis, incluindo turno, responsáveis, status, horários e medidas; a tela informará explicitamente que ocorrências não têm associação automática quando não existe vínculo direto.
- Reaproveitar o Painel gerencial existente como consolidado diário: deixar claro que “Hoje” reúne T1+T2+T3, manter setores e unidades separados e calcular o tempo parado com as ocorrências finalizadas reais.
- Não alterar banco, Fitas, setores aguardando definição, regras do Protheus, PDF/e-mail ou publicação.

## Detalhes técnicos
- Manter cálculos industriais puros nas bibliotecas existentes e ampliar testes apenas onde necessário.
- Preservar o padrão mobile-first e dark mode das telas atuais.

## Validação
- Rodar TypeScript, testes e build.
- Conferir no preview o Painel do Corte e as telas gerenciais em celular, sem gravar dados.