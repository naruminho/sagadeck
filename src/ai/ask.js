// Pergunta no meio do trabalho. A pessoa pediu uma mudança, a IA está trabalhando e ela quer tirar uma dúvida (sobre o
// que pensou ou sobre algo que a IA escreveu no andamento). Antes, a pergunta entrava na fila e a resposta chegava no
// fim, diluída no texto da tarefa. Aqui ela é respondida na hora, só como conversa: nada muda nos slides, e o modelo
// recebe o que está sendo feito (o pedido em curso e o andamento) para responder sobre isso também.
import { chat } from "./llm.js";
import { reference, conversationFor, toYaml } from "./deck-ai.js";

const clip = (s, n) => { const t = String(s ?? ""); return t.length > n ? `${t.slice(0, n)}…` : t; };

export function askPrompt({ question, spec = {}, targetSlide = null, history = [], working = null }) {
  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  const outline = slides.map((s, i) => `${i + 1}. ${s?.layout || "?"}${s?.title ? ` — ${clip(String(s.title).replace(/\s+/g, " "), 80)}` : ""}`).join("\n");
  const current = typeof targetSlide === "number" && slides[targetSlide] ? `\nSlide na tela (${targetSlide + 1}):\n${clip(toYaml({ slides: [slides[targetSlide]] }), 3000)}` : "";
  const work = working && (working.request || working.progress)
    ? `\nO QUE VOCÊ ESTÁ FAZENDO AGORA (outro pedido dela, ainda em andamento):\nPedido: ${clip(working.request, 1500)}\nAndamento que você já escreveu na tela:\n${clip(working.progress, 4000)}\n`
    : "";
  const { recent, memory } = conversationFor(history);
  const system = `Você é o assistente do sagadeck (gerador de apresentações). A pessoa fez uma PERGUNTA enquanto você trabalha num pedido dela.

Responda SÓ a pergunta, agora:
- Comece pela resposta, na primeira frase. Depois, o necessário para ela entender sem precisar reler o resto da conversa: 2 a 6 frases completas, sem jargão solto. Nada de lista longa nem de relatório do que você fez.
- Se a pergunta é sobre algo que você escreveu no andamento ("o que quis dizer com…", "por que…"), cite o trecho e explique.
- Esta resposta NÃO muda os slides nem o pedido em andamento. Se a resposta sugere uma mudança, diga qual e que ela pode pedir quando quiser; não diga que fez.
- Se não dá para saber (ainda está em andamento), diga o que já dá para dizer e o que só vai saber no fim.
- Escreva no idioma da pergunta.

Recursos do sagadeck (referência completa; só existe o que está aqui):
${reference()}`;
  const context = `Apresentação aberta: ${clip(spec.title || "(sem título)", 120)}, ${slides.length} slide(s).\n${outline}${current}\n${work}${memory ? `\n${memory}\n` : ""}`;
  return [
    { role: "system", content: system },
    ...recent,
    { role: "user", content: `${context}\nPERGUNTA: ${question}` },
  ];
}

export async function answerQuestion(input, { signal } = {}) {
  const question = String(input?.question || "").trim();
  if (!question) throw new Error("pergunta vazia");
  const r = await chat(askPrompt({ ...input, question }), { signal, maxTokens: 1500, temperature: 0.3 });
  return { reply: String(r.text ?? r.content ?? "").trim() };
}
