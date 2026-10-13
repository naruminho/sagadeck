// Bases curtas para começar uma apresentação técnica sem esperar pela IA.
// São modelos de fábrica; cada uso cria uma instância pela biblioteca.
export function developerStarter(kind, { title } = {}) {
  const code = 'function normalizar(nome) {\n  return nome.trim().toLowerCase();\n}\n\nconst usuario = normalizar("  Ada  ");\nconsole.log(usuario);';
  const curl = ['curl --request POST "$BASE/echo" \\', '  --header "Content-Type: application/json" \\', '  --data \'{"mensagem":"Olá, API"}\''].join("\n");
  if (!["programacao", "apis"].includes(kind)) throw new Error("Escolha uma base de programação ou APIs com cURL.");
  const programming = kind === "programacao";
  const name = String(title || (programming ? "Meu código, passo a passo" : "Minha primeira API com cURL")).trim();
  return {
    title: name, theme: programming ? "terminal-pro" : "aurora-dev", duration: 6, purpose: "palestra", maxWords: 70,
    ...(!programming ? { env: "ensaio" } : {}),
    slides: [
      { layout: "cover", kicker: "Exemplo para editar", title: name,
        subtitle: programming ? "Entrada, transformação e resultado" : "Entenda o comando e experimente uma chamada",
        figure: { motion: { type: "console", caption: programming ? "normalizar.js · saída de exemplo" : "curl · saída de exemplo", scenes: [{ cmd: programming ? "node normalizar.js" : 'curl --request POST "$BASE/echo"', out: programming ? ["ada"] : ['200 OK', '{ "mensagem": "Olá, API" }'] }] } },
        notes: "Este é um exemplo de fábrica para você editar. Use Inserir › Código / cURL para colar seu conteúdo. A animação da capa mostra uma saída ilustrativa." },
      programming ? {
        layout: "codewalk", title: "Uma transformação em ==três passos==", filename: "normalizar.js", language: "JavaScript", code,
        steps: [
          { title: "Definir a regra", text: "A função recebe um nome. trim remove os espaços nas pontas; toLowerCase converte as letras para minúsculas.", highlight: [1, 2, 3] },
          { title: "Aplicar à entrada", text: "Os espaços e as letras maiúsculas entram no mesmo exemplo.", highlight: [5] },
          { title: "Conferir a saída", text: "O resultado pode ser copiado e usado no restante do programa.", highlight: [6], output: "ada" },
        ], notes: "Troque o código em Formatar. Selecione as linhas e crie uma etapa para explicar o trecho. A saída deste guia é ilustrativa, sem executar o código."
      } : {
        layout: "codewalk", title: "O cURL em ==três partes==", filename: "pedido.sh", language: "Bash", code: curl,
        steps: [
          { title: "Método e destino", text: "POST envia os dados para o endpoint. BASE é o endereço do ambiente.", highlight: [1] },
          { title: "Formato dos dados", text: "Content-Type avisa ao servidor que o corpo é JSON.", highlight: [2] },
          { title: "O corpo enviado", text: "A mensagem é o dado que vamos conferir na resposta.", highlight: [3] },
        ], notes: "Este comando explica a chamada, sem executá-la. O próximo slide chama a API de ensaio do Studio local."
      },
      programming ? {
        layout: "diagram", title: "Veja o ==caminho== dos dados", mermaid: 'flowchart LR\n  A["Entrada: espaços e maiúsculas"] --> B["trim + toLowerCase"] --> C["Saída: ada"]',
        notes: "Troque os nós pelo fluxo do seu programa. Use a mesma entrada e a mesma saída em toda a explicação."
      } : {
        layout: "api", title: "Experimente ==ao vivo==", text: "No Studio local, clique em Executar. Troque a mensagem no Corpo e execute novamente.", tab: "curl",
        request: { method: "POST", url: "{{base}}/echo", auth: false, body: { mensagem: "Olá, API" } }, answer: "$.recebido",
        notes: "Ambiente ENSAIO: API de mentira que o Studio local fornece. No servidor multiusuário, chamadas não são executadas. Para usar seu serviço, troque o ambiente e importe seu cURL por Inserir › Código / cURL."
      },
      { layout: "code", title: programming ? "Conferir a ==entrada e saída==" : "Ler a ==resposta==", filename: "resposta.json", language: "JSON",
        code: programming ? '{\n  "entrada": "  Ada  ",\n  "saida": "ada"\n}' : '{\n  "metodo": "POST",\n  "recebido": { "mensagem": "Olá, API" },\n  "consulta": {}\n}',
        note: programming ? "Mantenha um exemplo concreto do começo ao fim da explicação." : "O campo recebido contém os mesmos dados enviados no corpo." },
      { layout: "end", title: "Agora, o ==seu exemplo==", subtitle: "Cole seu conteúdo em Inserir › Código / cURL ou peça ao assistente para explicar os trechos.", notes: "Você pode aplicar outro tema em Design. O exemplo é seu para editar; cada uso cria uma apresentação independente." },
    ],
  };
}
