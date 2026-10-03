// Gera um clipe com o OpenRouter (/videos, ex.: google/veo-3.1-lite) e baixa o MP4.
// Uso: OPENROUTER_API_KEY=... node tools/generate-video.mjs --prompt "..." --out cena.mp4
//      [--model google/veo-3.1-lite] [--duration 4] [--resolution 720p] [--aspect 16:9]
//      [--seed 7] [--dry-run]  (dry-run só valida os parâmetros no catálogo, sem gastar)
import fs from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [];
  }).filter((e) => e.length),
);
if (args.help || !args.prompt || !args.out) {
  console.log("Uso: node tools/generate-video.mjs --prompt <texto> --out <arquivo.mp4> [--model ...] [--duration N] [--resolution 720p] [--aspect 16:9] [--seed N] [--dry-run]");
  process.exit(args.help ? 0 : 2);
}
const key = process.env.OPENROUTER_API_KEY;
if (!key) { console.error("Falta OPENROUTER_API_KEY no ambiente."); process.exit(2); }
const model = args.model || "google/veo-3.1-lite";
const api = async (path, opts = {}) => {
  const r = await fetch(`https://openrouter.ai/api/v1${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

// valida de graça no catálogo antes de gastar
const catalog = await api("/videos/models");
const meta = catalog.data?.find((m) => m.id === model || m.canonical_slug === model);
if (!meta) throw new Error(`Modelo de vídeo desconhecido: ${model}`);
const pick = (want, list, name) => {
  if (want == null || want === "") return undefined;
  const s = String(want);
  if (list?.length && !list.map(String).includes(s)) throw new Error(`${name} "${s}" inválido para ${model} (vale: ${list.join(", ")})`);
  return isNaN(Number(s)) ? s : Number(s);
};
const duration = pick(args.duration ?? 4, meta.supported_durations, "duration") ?? 4;
const resolution = pick(args.resolution ?? "720p", meta.supported_resolutions, "resolution") ?? "720p";
const aspect_ratio = pick(args.aspect ?? "16:9", meta.supported_aspect_ratios, "aspect_ratio") ?? "16:9";
const body = { model, prompt: args.prompt, duration, resolution, aspect_ratio, generate_audio: false };
if (args.seed != null) body.seed = Number(args.seed);
if (args["dry-run"]) { console.log(`OK (sem gastar): ${model} ${duration}s ${resolution} ${aspect_ratio}`); process.exit(0); }

console.log(`Enviando: ${model} ${duration}s ${resolution} ${aspect_ratio}…`);
let job = await api("/videos", { method: "POST", body: JSON.stringify(body) });
const t0 = Date.now();
for (;;) {
  const st = await api(new URL(job.polling_url).pathname);
  console.log(`… ${st.status} (${Math.round((Date.now() - t0) / 1000)}s)`);
  if (st.status === "completed") { job = st; break; }
  if (["failed", "cancelled", "expired"].includes(st.status)) throw new Error(`Geração ${st.status}: ${st.error || "sem detalhe"}`);
  if (Date.now() - t0 > 20 * 60 * 1000) throw new Error("Tempo esgotado (20 min) aguardando o vídeo.");
  await new Promise((r) => setTimeout(r, 30000));
}
const dl = job.unsigned_urls?.[0] ?? `https://openrouter.ai/api/v1/videos/${job.id}/content?index=0`;
const bin = await fetch(dl, dl.startsWith("https://openrouter.ai/api/") ? { headers: { Authorization: `Bearer ${key}` } } : {});
if (!bin.ok) throw new Error(`Download falhou: ${bin.status}`);
fs.writeFileSync(args.out, Buffer.from(await bin.arrayBuffer()));
console.log(`Salvo: ${args.out} (${fs.statSync(args.out).size} bytes, custo $${job.usage?.cost ?? "?"})`);
process.exit(0);
