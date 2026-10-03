# Avaliação em um tema novo: desinformação

Pedido de 03/10/2026: testar a autonomia do SagaDeck fora da hidrologia.

## Entrega

- Duas apresentações geradas pelo agente do Studio: executivos e estudantes, com o mesmo conteúdo e sequenciamento.
- Tema: Como uma mentira vira verdade na internet? O título é provocativo; a explicação distingue verdade de percepção de credibilidade.
- Casos fictícios, sem acusações contra pessoas reais. Referência conceitual: alfabetização midiática da UNESCO.
- Experiências: três publicações e revelação de evidências; propagação parametrizada; gráfico com escala/recorte; enquadramento de imagem; decisão de verificação.
- Notas para palco e material de estudo com explicações e limites dos modelos.

## Execução e critérios

1. Gerar pela API pública do Studio, na biblioteca oficial, sem escrever slides por script externo.
2. Inspecionar ambos os decks: narrativa preservada, identidade distinta, dados fictícios sinalizados, controles que alteram resultados.
3. Testar extremos, restaurar, comparação, previsão e revelação; conferir estudo e ausência de erros no navegador.
4. Registrar falhas reais. Correções no produto precisam de reprodução automatizada e devem funcionar fora deste assunto.
5. Para alterações de código: suíte, bundle, commit, push, PR, merge; reinício na 3517 quando necessário.

## Avanços

- Plano registrado. Configuração local usa DeepSeek V4.1 Flash. Oracle permanece fora desta rodada.
- Próximo passo: geração real das duas versões pelo Studio.
- Primeira geração executiva: 10 slides, duas imagens, cerca de 341 s; três rodadas de correção visual deixaram uma pendência. Gráfico foi substituído por painel numérico e decisão por diagrama estático.
- Correção pelo chat: 11 slides, gráfico Plotly com seis valores preservados, comparação entre escalas, hub com três destinos e retorno. Revisão do agente aprovada; cliques reais confirmaram navegação, zoom e restauração.
- Experiência de propagação: cenário inicial 20 pessoas; cenário Viral 538. Comparação e restauração funcionaram no palco e no HTML de estudo offline. Exportação de estudo abriu com 11 imagens, nenhuma quebrada e nenhum erro JavaScript.
- Primeira geração estudantil caiu durante a correção por falha de DNS do provedor. Reproduzido: a geração descartava um deck já válido quando a etapa opcional de reparo falhava.
- Repetição estudantil: 10 slides em cerca de 450 s, com duas pendências explícitas. Também mudou exemplos e sequência. Guardada como diagnóstico na biblioteca; a versão final parte de uma cópia da executiva e recebe direção visual pelo chat.
- Correções gerais com testes reproduzindo as falhas: preservar geração válida em falha do reparo; informar progresso por slide; devolver e guardar relatório de geração; impedir corte do painel calc com duas curvas, inclusive após comparação.
- Testes específicos: 18 passaram. Suíte inicial: 700 testes, um teste de inspetor falhou e passou isoladamente; suíte final em andamento.
- Versões finais: 11 slides cada, editorial para executivos e Bauhaus para estudantes. A variante estudantil foi feita pelo chat em cerca de 30 s a partir do conteúdo aprovado. Conferência visual do agente aprovada; comparação estrutural encontrou zero diferenças nos textos de estudo/notas, dados, fórmulas, cenários, imagens dos exemplos e navegação.
- Verificação adicional em ambos os HTMLs: nenhuma imagem quebrada, zero erros JavaScript, painel calc dentro da área útil. Material de estudo HTML gerado para ambas as versões; cenário e restauração também funcionam nele offline.
- Mais uma falha geral reproduzida: `consulta` era contada como texto do palco no aviso de excesso de palavras. Corrigida com teste que mantém a contagem ao adicionar explicação de estudo longa.
- Limites encontrados: gerar duas versões independentemente não garantiu fidelidade entre elas; mudanças visuais sobre uma cópia do conteúdo aprovado funcionaram nesta rodada. A geração precisou de orientação adicional para aproveitar gráficos e caminhos nativos. Não é evidência de autonomia completa.
- O diagnóstico com oito curvas revelou painel além do rodapé. Teste reproduziu término em 1946 px para uma área útil até 976 px. Corrigida distribuição automática em grade com controles acima; conferência real confirmou oito resultados visíveis, comparação e total 362,2 no cenário de 70%. Persistência do relatório extraída para módulo próprio após o guard de tamanho do servidor falhar; nova suíte completa em andamento.
- A verificação na página local revelou também a explicação inicial longa além do rodapé. Teste adicional falhou (1027 px para limite 976 px); ajuste inclui a explicação. Após correção, página real confirmou texto e painel dentro da área útil, sem erros JavaScript. Os três caminhos e retornos funcionaram em ambas as versões finais; restaurar voltou ao resultado inicial 20.
- Validação final: npm test passou com 705 testes, 685 aprovados, 20 pulados e zero falhas; bundle atualizado. Código pronto para publicação da etapa.
