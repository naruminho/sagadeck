// Unidades para a conferência das contas: "kN/m²" → fator para o SI e dimensão (comprimento, massa, tempo,
// temperatura, corrente, quantidade, intensidade luminosa). Só o necessário para as contas de aula e relatório;
// unidade desconhecida devolve null e a conta é conferida sem unidades, como antes.
const DIMS = ["m", "kg", "s", "K", "A", "mol", "cd"];
const d = (m = 0, kg = 0, s = 0, K = 0, A = 0, mol = 0, cd = 0) => [m, kg, s, K, A, mol, cd];
const U = (factor, dim) => ({ factor, dim });

// unidade → fator para o SI e dimensão
const BASE = {
  m: U(1, d(1)), g: U(1e-3, d(0, 1)), s: U(1, d(0, 0, 1)), K: U(1, d(0, 0, 0, 1)), A: U(1, d(0, 0, 0, 0, 1)),
  mol: U(1, d(0, 0, 0, 0, 0, 1)), cd: U(1, d(0, 0, 0, 0, 0, 0, 1)),
  N: U(1, d(1, 1, -2)), Pa: U(1, d(-1, 1, -2)), J: U(1, d(2, 1, -2)), W: U(1, d(2, 1, -3)),
  L: U(1e-3, d(3)), l: U(1e-3, d(3)), Hz: U(1, d(0, 0, -1)), V: U(1, d(2, 1, -3, 0, -1)), "Ω": U(1, d(2, 1, -3, 0, -2)),
  bar: U(1e5, d(-1, 1, -2)), C: U(1, d(0, 0, 1, 0, 1)),
};
const PREFIXABLE = new Set(["m", "g", "s", "N", "Pa", "J", "W", "L", "l", "Hz", "V", "Ω", "bar", "A", "mol", "C"]);
const PREFIX = { G: 1e9, M: 1e6, k: 1e3, h: 1e2, d: 1e-1, c: 1e-2, m: 1e-3, "µ": 1e-6, "μ": 1e-6, u: 1e-6, n: 1e-9 };
// nomes que não seguem a regra do prefixo
const NAMED = {
  min: U(60, d(0, 0, 1)), h: U(3600, d(0, 0, 1)), dia: U(86400, d(0, 0, 1)), ano: U(31557600, d(0, 0, 1)),
  t: U(1000, d(0, 1)), atm: U(101325, d(-1, 1, -2)), "°C": U(1, d(0, 0, 0, 1)), "ºC": U(1, d(0, 0, 0, 1)),
  // carga em coluna de água (mH₂O, mca) é altura: na conta de energia ela entra como metro
  mca: U(1, d(1)), mH2O: U(1, d(1)), "mH₂O": U(1, d(1)), mmHg: U(133.322, d(-1, 1, -2)),
  pol: U(0.0254, d(1)), "%": U(0.01, d()), rad: U(1, d()), sr: U(1, d()), "": U(1, d()),
  adimensional: U(1, d()), "-": U(1, d()), cv: U(735.5, d(2, 1, -3)), hp: U(745.7, d(2, 1, -3)), kWh: U(3.6e6, d(2, 1, -2)),
};

function token(name) {
  if (name in NAMED) return NAMED[name];
  if (name in BASE) return BASE[name];
  for (const [p, f] of Object.entries(PREFIX)) {
    if (name.startsWith(p) && PREFIXABLE.has(name.slice(p.length))) { const b = BASE[name.slice(p.length)]; return U(b.factor * f, b.dim); }
  }
  return null;
}

const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };

export function parseUnit(text) {
  let s = String(text ?? "").trim().replace(/m\.c\.a\.?/g, "mca").replace(/\\mathrm\{([^}]*)\}/g, "$1").replace(/[{}\\]/g, "")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (x) => `^${[...x].map((c) => SUP[c]).join("")}`).replace(/[()]/g, "");
  if (s in NAMED) return NAMED[s];
  const parts = s.split("/");
  let factor = 1; const dim = d();
  for (const [k, part] of parts.entries()) {
    const sign = k === 0 ? 1 : -1;
    for (const raw of part.split(/[·*×.\s]+/).filter(Boolean)) {
      const m = /^(.+?)(?:\^?(-?\d+))?$/.exec(raw);
      if (!m) return null;
      const u = token(m[1]);
      if (!u) return null;
      const e = sign * (m[2] ? Number(m[2]) : 1);
      factor *= u.factor ** e;
      u.dim.forEach((x, i) => { dim[i] += x * e; });
    }
  }
  return U(factor, dim);
}

export const sameDim = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-6);

// "m·s^-1" para os avisos
export function dimText(dim) {
  const out = dim.map((e, i) => (Math.abs(e) < 1e-6 ? "" : Math.abs(e - 1) < 1e-6 ? DIMS[i] : `${DIMS[i]}^${Number(e.toFixed(2))}`)).filter(Boolean);
  return out.length ? out.join("·") : "adimensional";
}

// A dimensão de uma conta sem árvore de expressão: troca a escala de cada grandeza de base (comprimento ×2, depois
// ×3…) e vê quanto o resultado muda. Conta coerente muda como uma potência; soma de grandezas diferentes (metro com
// pascal) não muda como potência nenhuma e é apontada. `run(scales)` calcula a conta com as entradas escalonadas.
export function dimensionOf(run) {
  const one = DIMS.map(() => 1);
  const base = run(one);
  if (base == null || !Number.isFinite(base) || base === 0) return null;
  const dim = [];
  for (let i = 0; i < DIMS.length; i++) {
    const at = (k) => { const sc = one.slice(); sc[i] = k; const v = run(sc); return v == null ? NaN : v / base; };
    const r2 = at(2), r3 = at(3);
    if (!(r2 > 0) || !(r3 > 0)) return { mixed: true };
    const e2 = Math.log(r2) / Math.log(2), e3 = Math.log(r3) / Math.log(3);
    if (Math.abs(e2 - e3) > 1e-6) return { mixed: true };
    dim.push(Math.round(e2 * 1e6) / 1e6);
  }
  return { dim };
}
