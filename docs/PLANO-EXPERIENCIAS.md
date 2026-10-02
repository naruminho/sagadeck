# Experiências exploráveis e autonomia — 02/10/2026

Pedido autorizado: implementar as sete prioridades discutidas, registrar avanços e publicar etapas validadas.
Não reescrever apresentações pessoais. Pasta oficial: C:\Users\narum\src\sagadeck; biblioteca: C:\Users\narum\sagadeck.

## Etapas e critérios de conclusão

- [x] 1. Avaliação de autonomia: pedidos variados inéditos, execução pelo agente interno, relatório de qualidade, custo/tempo e intervenções. Mocks verificam infraestrutura; execução real separada e explicitamente identificada.
- [x] 2. Ciclo de criação/revisão: validar modelos interativos, revisar resultados renderizados e devolver achados ao agente, sem confundir YAML válido com qualidade comprovada.
- [x] 3. Experiências conectadas: entradas compartilhadas, saídas e representações sincronizadas; cenários, comparação congelada, restaurar, mudanças destacadas e explicação. Testar estados e erros.
- [x] 4. Curiosidade: prever antes de revelar; explorar limites/falhas/comparar hipóteses sem dependência de um assunto específico. Exemplos de fábrica acessíveis.
- [x] 5. Continuidade: objetos identificáveis entre cenas, transição ligada à explicação, alternativa com movimento reduzido.
- [x] 6. Direção de arte: alternativas realmente diferentes com mesmo conteúdo, contexto visual do conjunto e detecção de repetição. Camadas editáveis usando recursos existentes.
- [x] 7. Apresentar/estudar/exportar: exploração guiada e livre, material de estudo com estados relevantes e explicações, sem duplicação manual do conteúdo.

## Protocolo de trabalho

Cada etapa: implementar motor + interface necessária + referência da IA + testes; bundle; npm test; commit/push/PR/merge. Registrar evidência real, limitações e próximo passo aqui e em ANDAMENTO.md. Reiniciar serviço local verificado na porta 3517 quando necessário. Sem deploy Oracle neste pedido.

## Estado de retomada

- 02/10: regras e código atual inspecionados; árvore limpa em main 62d36f9. Branch codex/experiencias-exploraveis.
- Base existente: calc, science, algo, widgets, estudo, variantes de slide, revisão visual de transformação. Evoluir estes caminhos em vez de criar sistemas paralelos.
- Implementação e validação local concluídas; publicação e merge em andamento.
- As sete frentes têm implementação inicial verificável; os limites abaixo fazem parte da entrega.

## Avanço verificável

- Implementação inicial das sete frentes validada na branch; publicação em andamento.
- Testes específicos: 9 de motor/navegador/estudo/revisão; teste Studio com dois subcasos verifica gravação da pergunta e aplicação da direção escolhida. Passaram.
- Estudo HTML agora permite exploração offline dos mesmos controles; impressão mantém os estados nomeados e explicações.
- Primeira avaliação real: cinco casos gerados, todos marcados needs-work. Achados incluíam preferências estéticas tratadas como defeitos e frames intermediários confundidos com o final. A revisão foi ajustada para evidência concreta; snapshots amostram início e fim. Nenhum deck da avaliação foi retocado manualmente.
- Limites conhecidos: continuidade é de posição/tamanho, não morph de geometria; direção aplica tema ao conjunto e composição ao slide escolhido; validação numérica amostra extremos individuais, não prova domínio contínuo. Tokens/custo medidos por tarefa quando o provedor informa; dados ausentes permanecem indisponíveis.
- Validação final: npm test, 691 testes (671 passaram, 20 pulados, zero falhas), 894,7 s. Alterações finais cobertas novamente pelos testes específicos de IA, navegador, Studio e guardas. Bundle atualizado.
- Segunda rodada real: geometria e narrativa conferidas; capacidade, algoritmo e consulta com pendências. Terceira sondagem de capacidade identificou falta de escala na curva e feedback dos controles: motor corrigido, teste de contraste incluído. Não houve retoque manual de deck. A avaliação é um instrumento de melhoria contínua, não uma promessa de perfeição autônoma.
- Inspeção visual da demo: controles e resultados dentro do palco; contraste legível. Studio reiniciado em http://127.0.0.1:3517/editor?model=explorar.
- Próximo passo operacional: commit/push/PR/merge e último reinício da versão publicada.

- Porta local atualizada por instrução expressa do usuário: 3517. Processo SagaDeck anterior identificado nessa porta; wotan-router ocupa 3001 e não deve ser encerrado.
