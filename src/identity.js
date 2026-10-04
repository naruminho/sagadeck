// Identidades: as fontes (e a paleta preferida) da empresa da pessoa. Ficam só na máquina dela, em
// ~/.sagadeck/identidades.yaml (ou SAGADECK_IDENTIDADES): o nome da fonte de uma empresa nunca entra no
// software nem no repositório. O deck só diz qual usar (identity: trabalho); sem o arquivo nesta máquina, o deck
// abre com as fontes do tema e um aviso.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

// (no Windows, C:\Users\<você>\.sagadeck\identidades.yaml, ao lado do ambientes.yaml)
export function identitiesFile(env = process.env, home = os.homedir()) {
  return env.SAGADECK_IDENTIDADES || path.join(home, ".sagadeck", "identidades.yaml");
}

// Modelo comentado (o Studio cria quando a pessoa pede para configurar)
export const IDENTITY_TEMPLATE = `# Identidades do sagadeck: as fontes e cores da sua empresa. Este arquivo fica só neste computador.
#
# Cada identidade tem um nome curto (usado no deck: "identity: trabalho") e:
#   nome:    como aparece no Studio
#   fontes:  por papel, em ordem de preferência; se nenhuma estiver instalada, entra a fonte do tema
#     titulo:   títulos e manchetes (nos temas com personalidade, como rabisco e pop, o título fica com a
#               fonte do tema e o resto usa a da empresa)
#     corpo:    textos, listas e subtítulos
#     compacta: rótulos, legendas e tabelas (opcional; sem ela, vale a do corpo)
#     codigo:   código (opcional)
#   paleta:  uma das paletas do sagadeck (rubi, ametista, tangerina, safira, esmeralda, tinta…) ou as suas cores:
#            { paper: "FFFFFF", ink: "3B2B33", accent: "B83A6E", alert: "CC092F", family: ["F9DCE5", "D9668F"] }
#            (vale quando o deck não escolheu outra paleta)
#
# O arquivo da fonte não é embutido na apresentação (a licença de fontes de empresa costuma proibir): quem abrir
# numa máquina sem a fonte vê a do tema.

trabalho:
  nome: Trabalho
  fontes:
    titulo: ["Nome da Fonte Sans", "Nome da Fonte Sans Compact"]
    corpo: ["Nome da Fonte Sans"]
    compacta: ["Nome da Fonte Sans Compact"]
  paleta: rubi
`;

let cache = { file: null, mtime: 0, size: -1, data: null };

// { file, exists, identities: { id: { id, name, fonts: { titulo, corpo, compacta, codigo }, palette } }, error }
export function loadIdentities(env = process.env) {
  const file = identitiesFile(env);
  let st = null;
  try { st = fs.statSync(file); } catch { return { file, exists: false, identities: {}, error: null }; }
  if (cache.file === file && cache.mtime === st.mtimeMs && cache.size === st.size && cache.data) return cache.data;
  let data;
  try {
    const raw = YAML.parse(fs.readFileSync(file, "utf8")) || {};
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("o arquivo precisa ser uma lista de identidades (nome: { fontes, paleta })");
    const list = (v) => [].concat(v || []).map((x) => String(x).trim().replace(/^["']|["']$/g, "")).filter(Boolean).slice(0, 6);
    const identities = {};
    for (const [id, v] of Object.entries(raw)) {
      if (!v || typeof v !== "object") continue;
      const f = v.fontes || v.fonts || {};
      identities[id] = {
        id, name: String(v.nome || v.name || id),
        fonts: { titulo: list(f.titulo || f.title), corpo: list(f.corpo || f.body), compacta: list(f.compacta || f.compact), codigo: list(f.codigo || f.code) },
        palette: v.paleta ?? v.palette ?? null,
      };
    }
    data = { file, exists: true, identities, error: null };
  } catch (e) {
    data = { file, exists: true, identities: {}, error: `identidades.yaml com erro: ${e.message}` };
  }
  cache = { file, mtime: st.mtimeMs, size: st.size, data };
  return data;
}

export function identityFor(id, env = process.env) {
  if (!id) return null;
  return loadIdentities(env).identities[id] || null;
}

// cria o modelo comentado (sem sobrescrever o que existe)
export function ensureIdentitiesFile(env = process.env) {
  const file = identitiesFile(env);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, IDENTITY_TEMPLATE, "utf8");
  }
  return file;
}
