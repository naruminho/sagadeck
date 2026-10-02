# SagaDeck — regras para todos os agentes

Leia e siga `CLAUDE.md` antes de editar, e `docs/ANDAMENTO.md` (o diário do que está em curso, do que já entrou e das decisões) antes de começar. As regras valem para Codex, Claude e outros agentes.

- Nunca edite o conteúdo de uma apresentação da pessoa por script próprio (nada de scripts pontuais no repositório com caminhos da máquina dela); decks são dados dela, e pedidos sobre eles se fazem pelo Studio/IA com `writeDeckFile`.
- Trabalho em curso vai para uma branch no GitHub a cada etapa (commit + push); mudança solta só no disco se perde e briga com o que outros agentes fizeram.

- Trabalhe só na pasta oficial `C:\Users\narum\src\sagadeck`, sem clones, worktrees ou cópias do repositório.

- Apresentações e seus arquivos ficam em `C:\Users\narum\sagadeck`, uma pasta por apresentação. Use os helpers da biblioteca. Modelos de fábrica podem ser definidos no código; instâncias de apresentações ficam na biblioteca.
- Preserve conteúdo, exemplos, ordem e cadência de apresentações existentes. Pedido de revisão pontual não autoriza reescrita integral. Use `writeDeckFile` para alterações.
- O usuário autorizou testar, commitar, publicar PR e fazer merge assim que o trabalho estiver concluído e validado. Não peça confirmação novamente. Não deixe trabalho pronto apenas em uma branch local.
- Depois de mudanças que exijam reiniciar, reinicie automaticamente o SagaDeck na porta **3517**, substituindo o processo anterior verificado. Não abra outra porta para o mesmo serviço. Informe a URL após reiniciar.
- Testes automatizados podem abrir portas efêmeras, devendo fechá-las ao terminar.
- Não versione credenciais, conversas privadas, gravações de APIs ou dados corporativos. Código, modelos de fábrica e testes vão para o GitHub; documentos pessoais permanecem na biblioteca.
