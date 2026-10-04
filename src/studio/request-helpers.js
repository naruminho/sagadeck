// "Olhos" da IA: foto do slide renderizado (uma por clique se o pedido falar de animação/ordem).
// Sem Chrome disponível, segue sem foto — a IA só perde a visão, o pedido continua.
const ANIM_WORDS = /clique|click|anima|aparec|revel|ordem|sequ[eê]n|entra|some|surge|transi/i;
export async function lookAt(spec, index, prompt, emit) {
  if (typeof index !== "number" || !spec?.slides?.[index]) return [];
  try {
    emit({ phase: "looking", text: "Olhando o slide…" });
    const { slideSnapshots } = await import("./snapshot.js");
    return await slideSnapshots(spec, index, { mode: ANIM_WORDS.test(prompt) ? "steps" : "final" });
  } catch (e) {
    console.warn("[Studio] sem foto do slide para a IA:", e.message);
    return [];
  }
}

// Resposta de uma tarefa de IA. Com stream, manda NDJSON: uma linha {type:"progress",…} por etapa/pedaço
// de texto e, no fim, {type:"result", data} ou {type:"error", error}. Sem stream, um JSON só.

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function readJSON(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error("JSON inválido no corpo da requisição"));
      }
    });
    req.on("error", reject);
  });
}
