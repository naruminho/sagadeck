// Demos de um assunto só (mapas, programação, APIs com curl): curtas, para mostrar um recurso a quem vai usá-lo, sem
// passar pelo Conheça o SagaDeck inteiro. Reaproveitam os exemplos de layout (layout-samples.js) e as demos de mapa do
// tour; cada slide diz o que é e a frase para pedir à IA (no rodapé e nas notas). Abrem em prévia, como os modelos.
import { LAYOUT_INFO, LAYOUT_SAMPLES, LAYOUT_ASK } from "./layout-samples.js";
import { mapDemos } from "./tour.js";

export const FEATURE_DEMO_NAMES = { mapas: "Demo — mapas", programacao: "Demo — programação", apis: "Demo — APIs com curl" };

const asked = (ask) => `Peça à IA: “${ask}”`;
const told = (label, desc, ask) => ({ source: `**${label}**: ${desc}. ${asked(ask)}`, notes: [`${label}: ${desc}.`, asked(ask)].join("\n\n") });
// o exemplo do layout, com o nome do recurso e a frase para a IA; extra troca o conteúdo quando o exemplo é genérico
const sample = (name, extra = {}) => {
  const [label, desc] = LAYOUT_INFO[name] || [name, ""];
  return { ...structuredClone(LAYOUT_SAMPLES[name]), layout: name, ...told(label, desc, LAYOUT_ASK[name] || ""), ...extra };
};
const cover = (title, subtitle, figure) => ({ layout: "cover", kicker: "SAGADECK · DEMO", title, subtitle, figure });

// ---- Mapas: mostrar, calcular, editar
export function mapasDemo() {
  const [bolhas, regioes, linhas, rota, raio, faixa, comIA, ondeEdita, telaMapa, noStudio] = mapDemos();
  return {
    title: FEATURE_DEMO_NAMES.mapas, theme: "oceano", duration: 15, maxWords: 140, slides: [
      cover("Mapas ==ao vivo==", "Pontos, linhas e áreas sobre o mapa de verdade, com as contas feitas pelo código", { icon: "map", size: 320 }),
      { layout: "statement", kicker: "a ideia", text: "A ==planilha== é a fonte; o mapa é a vista.",
        notes: "Os pontos vêm de uma planilha do projeto (contexto/*.csv), as linhas e áreas de GeoJSON, GPX ou KML. A mesma planilha serve tabela e gráfico. Nada de mapa chapado em imagem: ele é ao vivo." },
      { layout: "section", number: "01", kicker: "mostrar", title: "Dados no ==mapa==", subtitle: "pontos por categoria, bolhas, regiões por valor, linhas e áreas" },
      sample("map"), bolhas, regioes, linhas,
      { layout: "section", number: "02", kicker: "calcular", title: "As ==contas==", subtitle: "rota pelas ruas, alcance, raio e faixa: calculados, nunca desenhados à mão" },
      rota, raio, faixa,
      { layout: "section", number: "03", kicker: "editar", title: "Com a IA e no ==Studio==", subtitle: "a IA busca os dados; o Editar mapa mexe em cada ponto" },
      comIA, ondeEdita, telaMapa, noStudio,
      { layout: "end", title: "Agora, o seu ==mapa==.", subtitle: "Peça à IA: “Ponha no mapa os endereços da minha planilha”." },
    ],
  };
}

// ---- Programação: mostrar código, rodar ao vivo, Git a dois, explicar a arquitetura
const PEDIDOS = [
  "def total_do_pedido(itens, cupom=None):",
  "    subtotal = sum(i.preco * i.qtd for i in itens)",
  "    if cupom and cupom.valido():",
  "        subtotal -= cupom.desconto(subtotal)",
  "    frete = 0 if subtotal >= 200 else 19.90",
  "    return round(subtotal + frete, 2)",
].join("\n");
export function programacaoDemo() {
  return {
    title: FEATURE_DEMO_NAMES.programacao, theme: "musgo", duration: 15, maxWords: 140, slides: [
      cover("Código no ==palco==", "Do trecho destacado ao algoritmo rodando, com a plateia acompanhando linha a linha", { motion: { type: "console", caption: "projeto · terminal", scenes: [
        { cmd: "pytest -q", out: ["42 passed in 1.84s"] },
        { cmd: "git log --oneline -3", out: ["a1f9c2e calcula o frete", "77b03d4 aplica o cupom", "3c0e1aa primeira versão"] },
        { cmd: "python -m pedidos --demo", out: ["total: R$ 187,40", "frete: R$ 19,90"] },
      ] } }),
      { layout: "section", number: "01", kicker: "mostrar", title: "Código ==legível== de longe", subtitle: "destaque, linha a linha e material de consulta" },
      sample("code", { title: "Destaque o que ==importa==", filename: "pedidos.py", language: "python", code: PEDIDOS, highlight: [3, 4],
        note: "O cupom só vale se for válido: é aqui que o desconto entra." }),
      sample("codewalk"),
      sample("dossier"),
      { layout: "section", number: "02", kicker: "rodar", title: "Executar na ==frente== de todos", subtitle: "a plateia muda o código e vê o resultado" },
      sample("codelab"),
      sample("algo"),
      { layout: "section", number: "03", kicker: "colaborar", title: "Git e ==revisão==", subtitle: "duas pessoas, um clique por jogada" },
      sample("terminals"),
      sample("duel"),
      sample("turns"),
      { layout: "section", number: "04", kicker: "explicar", title: "A ==arquitetura==", subtitle: "fluxos, sequências e redes que dá para explorar" },
      sample("diagram", { title: "Do pedido ao ==pagamento==", mermaid: "sequenceDiagram\n  participant App\n  participant API\n  participant Pagamentos\n  App->>API: POST /pedidos\n  API->>Pagamentos: cobra o total\n  Pagamentos-->>API: aprovado\n  API-->>App: 201 Created" }),
      sample("graphlab"),
      { layout: "end", title: "Agora, o seu ==código==.", subtitle: "Peça à IA: “Explique este arquivo linha a linha, com a saída de cada passo”." },
    ],
  };
}

// ---- APIs com curl: anatomia de um curl, executar de verdade (no ambiente ENSAIO, a API de mentira que o Studio
// sobe sozinho), polling, streaming, as opções que mais ajudam e o cuidado com o token
const CURL = [
  'curl -X POST "https://api.exemplo.com/v1/pedidos" \\',
  '  -H "Authorization: Bearer $API_TOKEN" \\',
  '  -H "Content-Type: application/json" \\',
  `  -d '{"item": "livro", "quantidade": 2}' \\`,
  "  -i",
].join("\n");
const ensaio = "Roda no ambiente ENSAIO, a API de mentira que o Studio sobe sozinho: nada sai da sua máquina. Com o seu serviço, troque o endereço em Inserir › Ambientes.";
const apiSlide = (s) => {
  const t = told("API ao vivo", "Requisição que executa na hora, com o curl equivalente na aba curl", LAYOUT_ASK.api || "Mostre esta chamada ao vivo com o curl");
  return { layout: "api", tab: "curl", ...s, source: t.source, notes: [s.notes, ensaio, t.notes].filter(Boolean).join("\n\n") };
};
export function apisDemo() {
  return {
    title: FEATURE_DEMO_NAMES.apis, theme: "wine", duration: 15, maxWords: 140, slides: [
      cover("APIs com ==curl==", "Uma chamada por slide, executada na frente de todos, com o curl pronto para copiar", { motion: { type: "console", caption: "curl · ao vivo", scenes: [
        { cmd: `curl -X POST /v1/echo -d '{"mensagem":"Olá, API"}'`, out: ["200 OK", `{ "metodo": "POST", "recebido": { "mensagem": "Olá, API" } }`] },
        { cmd: "curl /v1/echo?cidade=Recife", out: ["200 OK", `{ "consulta": { "cidade": "Recife" } }`] },
        { cmd: "curl -N /v1/stream", out: ["200 OK · text/event-stream", "data: a resposta chega aos poucos..."] },
      ] } }),
      { layout: "statement", kicker: "a ideia", text: "O curl é a chamada de API ==mais curta== que existe.",
        notes: "Todo slide de API do SagaDeck mostra o pedido, executa de verdade e traz o curl equivalente na aba curl (e também JavaScript e Python)." },
      { layout: "codewalk", kicker: "anatomia", title: "Um curl em ==quatro partes==", filename: "pedido.sh", language: "bash", code: CURL,
        steps: [
          { title: "Verbo e endereço", text: "-X diz o que fazer (POST cria); a URL diz onde.", highlight: [1] },
          { title: "Quem está pedindo", text: "O token vai no cabeçalho Authorization. Ele vem de uma variável: nunca escrito no comando.", highlight: [2] },
          { title: "O que vai junto", text: "Content-Type avisa que o corpo é JSON; -d leva o corpo.", highlight: [3, 4] },
          { title: "Ver a resposta inteira", text: "-i mostra o status e os cabeçalhos antes do corpo.", highlight: [5], output: "HTTP/1.1 201 Created\ncontent-type: application/json\n\n{ \"id\": \"ped-42\", \"status\": \"criado\" }" },
        ], ...told("Código guiado", "Explique uma linha por vez, com destaques e saída simulada", "Explique este curl parte por parte") },
      { layout: "section", number: "01", kicker: "executar", title: "Ao ==vivo==, de verdade", subtitle: "o Executar faz a chamada; a aba curl mostra o comando" },
      apiSlide({ id: "post", kicker: "POST", title: "Mandar um ==corpo==", request: { method: "POST", url: "{{base}}/echo", body: { mensagem: "Olá, API", turma: "noite" } }, answer: "$.recebido",
        notes: "Edite a mensagem na aba Corpo e execute de novo: a aba curl acompanha." }),
      apiSlide({ id: "get", kicker: "GET", title: "Perguntar pela ==URL==", request: { method: "GET", url: "{{base}}/echo?cidade=Recife&dias=3" }, answer: "$.consulta",
        notes: "GET não tem corpo: os parâmetros vão na URL, depois do ?." }),
      apiSlide({ id: "token", kicker: "Token", title: "Com ==autorização==", request: { method: "POST", url: "{{base}}/sync", body: { q: "Qual é o status do pedido 42?" } }, answer: "$.choices[0].message.content",
        notes: "O token sai do ambiente (o Studio pede e renova sozinho). No curl ele aparece como $API_TOKEN: o valor nunca vai para o slide." }),
      { layout: "section", number: "02", kicker: "esperar", title: "Quando a resposta ==demora==", subtitle: "acompanhar até terminar, ou receber aos poucos" },
      apiSlide({ id: "polling", kicker: "Polling", title: "Inicia e ==acompanha==", mode: "polling",
        request: { url: "{{base}}/start", body: { workflow: "{{wf}}", input: { texto: "Resuma o contrato" } } },
        polling: { id: "$.executionId", check: { url: "{{base}}/status/{{id}}" }, status: "$.status", done: ["FINISHED"], failed: ["ERROR"], interval: 0.8 },
        steps: "$.responses", stepText: "$.output", notes: "O início devolve só o código da execução; a consulta repete até FINISHED. Na aba curl: o laço com sleep." }),
      apiSlide({ id: "stream", kicker: "Streaming", title: "A resposta chega ==aos poucos==", mode: "stream", request: { method: "POST", url: "{{base}}/stream", body: { stream: true } },
        notes: "No curl, -N desliga o buffer e o texto aparece enquanto chega." }),
      { layout: "section", number: "03", kicker: "dia a dia", title: "As opções que ==salvam== o dia", subtitle: "clique em cada cartão para ver para que serve" },
      // (oito cartões ocupam a área toda: aqui a frase para a IA fica só nas notas, sem a linha de rodapé)
      { layout: "cards", title: "Clique para ==virar==", cols: 4, notes: told("Cartão que vira", "A frente mostra a opção; o verso explica, no clique", "Faça cartões que viram com a explicação no verso").notes, items: [
        { icon: "file-text", title: "-i", text: "status e cabeçalhos", flip: "Mostra a linha de status e os cabeçalhos antes do corpo. O primeiro passo de toda investigação." },
        { icon: "bug", title: "-v", text: "conversa inteira", flip: "Mostra tudo: o pedido que saiu, o certificado, o que voltou. Para quando nada faz sentido." },
        { icon: "shield-alert", title: "--fail", text: "erro vira erro", flip: "Status 4xx ou 5xx faz o curl sair com erro. Essencial em script, que senão segue feliz." },
        { icon: "corner-down-right", title: "-L", text: "segue o redirecionamento", flip: "Vai atrás do 301 e do 302 até o endereço final." },
        { icon: "volume-x", title: "-s", text: "sem barra de progresso", flip: "Silencia o progresso; combine com -S para ainda ver os erros." },
        { icon: "download", title: "-o arquivo", text: "grava a resposta", flip: "Salva o corpo num arquivo em vez de jogar na tela." },
        { icon: "timer", title: "-w", text: "tempo e status", flip: "-w '%{http_code} %{time_total}s' imprime o status e quanto demorou." },
        { icon: "braces", title: "| jq", text: "JSON legível", flip: "Mande a saída para o jq: indenta, colore e filtra campos, como jq '.itens[0]'." },
      ] },
      { layout: "statement", kicker: "cuidado", text: "O token ==nunca== vai para o slide.",
        add: { aviso: { tipo: "perigo", titulo: "Segredo exposto", texto: "No deck, use {{secret.nome}}; no curl, $API_TOKEN. Os valores ficam nos Ambientes da sua máquina." } },
        notes: "Os segredos ficam em ~/.sagadeck/ambientes.yaml (no Windows, cifrados para o seu usuário). O deck pode ir para outras pessoas sem vazar nada." },
      { layout: "end", title: "Agora, a sua ==API==.", subtitle: "Peça à IA: “Monte um slide que chama o meu serviço e mostra o curl”." },
    ],
  };
}

export function featureDemo(kind) {
  if (kind === "mapas") return mapasDemo();
  if (kind === "programacao") return programacaoDemo();
  if (kind === "apis") return apisDemo();
  return null;
}
