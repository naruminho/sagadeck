// LLM falso, compatível com a API OpenAI (/v1/models e /v1/chat/completions), para testar os fluxos de IA
// sem depender do modelrelay: respostas roteirizadas, rápidas e sempre iguais.
//
//   const llm = await startMockLLM((req) => "resposta");   // req = { messages, system, lastUser, body }
//   llm.url -> "http://127.0.0.1:PORTA/v1"   ·   llm.requests -> tudo que o sagadeck mandou
import http from "node:http";

const textOf = (content) => typeof content === "string" ? content
  : Array.isArray(content) ? content.map((p) => p.text || "").join("\n") : "";

export async function startMockLLM(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    if (req.url.endsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "text" }, { id: "image" }] }));
      return;
    }
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw || "{}");
    const messages = body.messages || [];
    const ctx = {
      body, messages, headers: req.headers,
      system: textOf(messages.find((m) => m.role === "system")?.content),
      lastUser: textOf([...messages].reverse().find((m) => m.role === "user")?.content),
      hasImages: messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url")),
    };
    requests.push(ctx);
    let content;
    try { content = await handler(ctx); } catch (e) { content = `erro no mock: ${e.message}`; }
    // o handler pode simular erro do provedor: { status: 404, error: "No endpoints found that support image input" }
    if (content && typeof content === "object" && content.status) {
      res.writeHead(content.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: content.error, type: "ProviderError" } }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }); // JSON normal mesmo quando pedem stream (o cliente aceita)
    res.end(JSON.stringify({ model: "mock", choices: [{ message: { role: "assistant", content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`,
    requests,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}
