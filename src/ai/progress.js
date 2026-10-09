// Quadro de etapas da geração: cada aviso de progresso diz em que etapa está ("Leitura crítica: …") e, quando duas
// etapas correm juntas (o inventário do documento enquanto a crítica lê o texto), mostra as duas. Antes a tela
// ficava minutos em "Pensando…" sem dizer pensando em quê.
export function stageBoard(onEvent = () => {}) {
  const active = new Map(), done = [];
  const send = (extra = {}) => onEvent({ ...extra, stages: [...active.keys()], done: [...done],
    text: [...active].map(([label, text]) => (text ? `${label}: ${text}` : label)).join(' · ') });
  return {
    // roda fn(emit) como a etapa `label`; emit aceita texto ou o evento { phase, text, chars, preview }
    async run(label, fn) {
      active.set(label, '');
      send({ phase: 'stage' });
      const emit = (ev) => {
        if (!active.has(label)) return;
        const obj = ev && typeof ev === 'object' ? ev : { phase: 'step', text: ev };
        active.set(label, String(obj.text || ''));
        send({ ...obj, phase: obj.phase || 'step' });
      };
      try { return await fn(emit); }
      finally { active.delete(label); done.push(label); if (active.size) send({ phase: 'stage' }); }
    },
  };
}
