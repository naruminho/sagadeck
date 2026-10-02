// Um modelo geral, sem dados da pessoa ou dependência de rede.
export function explorationDemo() {
  const calc = { layout: 'calc', title: 'A espera cresce na mesma proporção?', illustrative: true,
    prediction: 'O que acontece quando a demanda se aproxima da capacidade?',
    explanation: 'A curva varia a demanda mantendo a capacidade escolhida. Compare os cenários.', sweep: 'demanda',
    inputs: { demanda: { label: 'Demanda', value: 2, min: 1, max: 9, step: 1, unit: 'tarefas/s' }, capacidade: { label: 'Capacidade', value: 10, min: 10, max: 20, step: 1, unit: 'tarefas/s' } },
    outputs: [{ name: 'espera', label: 'Tempo médio no sistema', fn: '1/(capacidade-demanda)', unit: 's', decimals: 3, scale: { min: 0, max: 1 } }],
    scenarios: [{ label: 'Folga', values: { demanda: 2 }, explanation: 'Existe uma grande margem de capacidade.' }, { label: 'Perto do limite', values: { demanda: 9 }, explanation: 'A espera cresce muito ao se aproximar da capacidade.' }, { label: 'Mais capacidade', values: { demanda: 9, capacidade: 18 }, explanation: 'Compare com o cenário anterior sem mudar a demanda.' }],
    consulta: 'Modelo ilustrativo M/M/1: chegadas de Poisson e tempos de serviço exponenciais, uma fila e um servidor, regime estacionário com demanda menor que capacidade. O tempo médio no sistema é 1/(capacidade-demanda). Não é uma previsão de um serviço real.' };
  return { title: 'Explore uma ideia', theme: 'bauhaus', purpose: 'palestra', duration: 8, slides: [
    { layout: 'cover', title: 'Uma pergunta.\nVários caminhos.', subtitle: 'Preveja, experimente e explique.', tone: 'light', figure: { icon: 'flask-conical', size: 320 } },
    calc,
    { layout: 'canvas', elements: [{ text: 'Uma solicitação', as: 'title', x: 150, y: 140, w: 1500 }, { text: 'Pedido', as: 'lead', card: true, continuity: 'pedido', x: 200, y: 470, w: 360, h: 150 }] },
    { layout: 'canvas', elements: [{ text: 'Agora olhe por dentro', as: 'title', x: 150, y: 140, w: 1500 }, { text: 'Pedido', as: 'lead', card: true, continuity: 'pedido', x: 750, y: 350, w: 650, h: 260 }, { text: 'O objeto continua reconhecível enquanto a explicação se aprofunda.', as: 'body', x: 180, y: 760, w: 1500 }] },
    { layout: 'statement', text: 'Não basta ver o resultado.\nExperimente o que o faz mudar.', tone: 'dark' },
  ] };
}
