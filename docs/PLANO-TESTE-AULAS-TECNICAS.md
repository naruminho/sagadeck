# Avaliação com aulas técnicas — HTTPX e grafos

## Objetivo
Gerar e testar duas aulas pelo agente do próprio SagaDeck, na biblioteca oficial. Sem retoques manuais nos YAMLs nem regras específicas para esses assuntos. Público desenvolvedor; palco e estudo no mesmo material.

## Casos
1. HTTPX avançado: clientes, configurações, timeouts, pool, concorrência limitada, streaming, falhas, retry, hooks, testes com MockTransport e HTTP/2. 14 slides iniciais, 45 minutos. Testar código longo, saídas, controles e material de consulta.
2. Grafos: conceitos antes das ferramentas; BFS e Dijkstra passo a passo, NetworkX e Neo4j/Cypher. 18 slides iniciais, 60 minutos. Mesmo grafo de cinco nós nas três abordagens, pesos não negativos. Menor custo A-C-B-D-E = 7, menos saltos A-B-E = 11. Testar traço, diagramas, código e preservação de dados.

## Execução
- Fontes oficiais consultadas em 03/10/2026: python-httpx.org; networkx.org/documentation/stable; neo4j.com/docs.
- Criar via /api/library/decks/ai no tópico Laboratório técnico; guardar revisão automática junto de cada deck.
- Inspecionar ordem, cobertura e conteúdo. Executar exemplos Python reais; não confundir saídas guiadas com execução no navegador.
- Conferir interação, legibilidade e estudo no navegador; qualquer falha geral ganha teste que falha antes da correção.
- Registrar evidência e limites; bundle, suíte completa, commit/push/PR/merge e reinício na 3517 para alterações de produto.
- Não requer instalar ou deployar Neo4j remoto, nem mudar Oracle. Exemplos que dependam de instância real devem dizer isso.

## Avanços
- Plano registrado; geração HTTPX iniciada pelo Studio. Grafos será gerado na sequência.
- Correções da avaliação anterior ainda em validação final, sem descarte de trabalho.
- HTTPX gerado: 17 slides, revisão visual do agente aprovada; alertas de ritmo (três códigos consecutivos e todos claros). Leitura encontrou URL relativa sem base_url, fórmula ceil exibida mas não calculada e MockTransport com endpoints diferentes em vez de retry do mesmo pedido. Corrigir pelo chat e testar código. Primeira geração de grafos falhou por DNS do provedor durante a escrita; repetir sem descartar a aula de HTTPX.
- HTTPX corrigido pelo chat com execução real de Python (comandos liberados): 200 respostas offline, retry da mesma URL503→200 e ceil210/20=11. Verificação independente executou o código exato dos slides, validou sintaxe de sete snippets e confirmou11/3,3 no navegador, zero erros JavaScript. A aula tem18 slides após inserir respiro visual.
- Grafos gerado na segunda tentativa:20 slides; uma pendência visual de BFS e alertas de ritmo. Encontradas duas falhas gerais: código longo não rolava até a linha da etapa; capturas de revisão usavam exportação, que ocultava os painéis interativos. Testes reproduziram linha fora da caixa e painel invisível; corrigidos no motor/captura,53 regressões específicas passaram. A captura agora traz o estado observado e usa palco sem movimento.

## Ampliação solicitada: laboratório de produto
- [x] Reproduzir a piscada e remover animação do quadro inteiro em algo, preservando sinais locais de mudança.
- [x] Rede explorável com cartões semânticos, seleção, cor, vizinhança/BFS, menor custo, foco, zoom/pan, edição e restauração. Exemplo de logística demonstra generalização.
- [x] Laboratório de código com edição de programa/entrada e execução rastreada offline; explicitar a diferença para Python com pacotes reais.
- [x] Pesquisa preserva inventário visual; agente pode importar imagem observada ou capturar página oficial pública, com origem e arquivo local.
- [x] Testar funções e fluxos reais no browser/Studio, aplicar às aulas pelo chat, verificar imagens oficiais reais e desafios dos alunos.
- [ ] Bundle, suíte completa, publicar e reiniciar na 3517. Sem deploy Oracle nesta etapa.

## Próxima etapa autorizada — execução, coleções e mídia
- [x] Python nativo e JavaScript nativo, com saída real e erros visíveis.
- [x] Coleções de APIs: importar/adicionar, selecionar serviço, editar pedido e executar; avaliar expansão para PDF/PPTX.
- [x] Player do YouTube e importação opcional de vídeo MP4 para a biblioteca.
- [x] Quadro isolado de HTML/CSS/JavaScript para animações personalizadas geradas pelo agente.
- [ ] Validar com aulas reais, documentar limites, publicar e reiniciar na porta 3517.

- Etapa de laboratórios: 716 testes, 696 passaram, 20 pulados, zero falhas; bundle atualizado. Próxima etapa de execução nativa, coleções e mídia ainda em implementação.

- Recursos seguintes implementados e documentados; suíte final com 729 testes, 709 aprovados e 20 pulados. Nenhum deploy Oracle. Publicação final em andamento.
