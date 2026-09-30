// Equação do Office (OMML, <m:oMath>) → LaTeX para o KaTeX: frações, índices, raízes, somatórios/integrais,
// parênteses, barras e acentos, funções, matrizes. O que não conhece vira o texto que tem dentro.
import { kids, kid, textOf } from "./xml.js";

const NARY = { "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "∬": "\\iint", "∭": "\\iiint", "∮": "\\oint", "⋃": "\\bigcup", "⋂": "\\bigcap" };
const SYM = { "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta", "Δ": "\\Delta", "ε": "\\varepsilon", "θ": "\\theta", "λ": "\\lambda", "μ": "\\mu", "ν": "\\nu", "π": "\\pi", "ρ": "\\rho", "σ": "\\sigma", "Σ": "\\Sigma", "τ": "\\tau", "φ": "\\varphi", "ω": "\\omega", "Ω": "\\Omega", "≤": "\\le ", "≥": "\\ge ", "≠": "\\ne ", "≈": "\\approx ", "×": "\\times ", "·": "\\cdot ", "∞": "\\infty ", "→": "\\to ", "±": "\\pm ", "∂": "\\partial ", "∇": "\\nabla " };
const ACC = { "̅": "\\overline", "̂": "\\hat", "̃": "\\tilde", "̇": "\\dot", "⃗": "\\vec", "̄": "\\bar" };
const FUNCS = new Set(["sin", "cos", "tan", "log", "ln", "exp", "lim", "max", "min", "sec", "csc", "cot", "arcsin", "arccos", "arctan"]);

// letras matemáticas do Unicode (𝑥, 𝐀, 𝛼…) que o Word usa: viram a letra comum, que o KaTeX já põe em itálico
function plainLetter(c) {
  const cp = c.codePointAt(0);
  if (cp === 0x210e) return "h";
  if (cp >= 0x1d400 && cp <= 0x1d6a3) { const k = (cp - 0x1d400) % 52; return String.fromCharCode(k < 26 ? 65 + k : 97 + k - 26); }
  if (cp >= 0x1d6a8 && cp <= 0x1d7c9) { const greek = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ∇αβγδεζηθικλμνξοπρςστυφχψω∂ϵϑϰϕϱϖ"; return greek[(cp - 0x1d6a8) % 58] || c; }
  if (cp >= 0x1d7ce && cp <= 0x1d7ff) return String((cp - 0x1d7ce) % 10);
  return c;
}
const esc = (s) => [...s].map(plainLetter).map((c) => (SYM[c] ? SYM[c].replace(/([a-zA-Z])$/, "$1 ") : /[{}#$%&_]/.test(c) ? `\\${c}` : c)).join("");
const val = (n, name) => kid(kid(n, name), "val")?.attrs["m:val"] ?? kid(n, name)?.attrs?.["m:val"];

export function ommlToLatex(node) {
  const conv = (n) => (n ? kids(n).map(one).join("") : "");
  const arg = (n, name) => conv(kid(n, name));
  const g = (s) => (s.length === 1 ? s : `{${s}}`);
  function one(n) {
    const k = n.name.split(":").pop();
    switch (k) {
      case "r": {
        const t = kids(n, "t").map(textOf).join("");
        const sty = kid(kid(n, "rPr"), "sty")?.attrs["m:val"];
        if (FUNCS.has(t.trim())) return `\\${t.trim()} `;
        return sty === "p" && /[a-z]{2,}/i.test(t) ? `\\mathrm{${esc(t)}}` : esc(t);
      }
      case "f": return `\\frac{${arg(n, "num")}}{${arg(n, "den")}}`;
      case "sSup": return `${g(arg(n, "e"))}^{${arg(n, "sup")}}`;
      case "sSub": return `${g(arg(n, "e"))}_{${arg(n, "sub")}}`;
      case "sSubSup": return `${g(arg(n, "e"))}_{${arg(n, "sub")}}^{${arg(n, "sup")}}`;
      case "sPre": return `{}_{${arg(n, "sub")}}^{${arg(n, "sup")}}${g(arg(n, "e"))}`;
      case "rad": { const deg = arg(n, "deg"); return deg ? `\\sqrt[${deg}]{${arg(n, "e")}}` : `\\sqrt{${arg(n, "e")}}`; }
      case "nary": {
        const ch = kid(kid(n, "naryPr"), "chr")?.attrs["m:val"] || "∫";
        const sub = arg(n, "sub"), sup = arg(n, "sup");
        return `${NARY[ch] || esc(ch)}${sub ? `_{${sub}}` : ""}${sup ? `^{${sup}}` : ""} ${arg(n, "e")}`;
      }
      case "d": {
        const pr = kid(n, "dPr");
        const beg = kid(pr, "begChr")?.attrs["m:val"] ?? "(", end = kid(pr, "endChr")?.attrs["m:val"] ?? ")";
        const sep = kid(pr, "sepChr")?.attrs["m:val"] ?? ",";
        const L = (c) => (c === "" ? "." : c === "{" ? "\\{" : c === "}" ? "\\}" : c === "|" ? "|" : c === "‖" ? "\\|" : c === "⌈" ? "\\lceil" : c === "⌉" ? "\\rceil" : c === "⌊" ? "\\lfloor" : c === "⌋" ? "\\rfloor" : c === "〈" || c === "⟨" ? "\\langle" : c === "〉" || c === "⟩" ? "\\rangle" : c);
        return `\\left${L(beg)}${kids(n, "e").map(conv).join(sep)}\\right${L(end)}`;
      }
      case "bar": return `${kid(kid(n, "barPr"), "pos")?.attrs["m:val"] === "bot" ? "\\underline" : "\\overline"}{${arg(n, "e")}}`;
      case "acc": { const ch = kid(kid(n, "accPr"), "chr")?.attrs["m:val"] || "̂"; return `${ACC[ch] || "\\hat"}{${arg(n, "e")}}`; }
      case "func": return `${arg(n, "fName").trim()} ${arg(n, "e")}`;
      case "limLow": return `${arg(n, "e")}_{${arg(n, "lim")}}`;
      case "limUpp": return `${arg(n, "e")}^{${arg(n, "lim")}}`;
      case "groupChr": return `\\underbrace{${arg(n, "e")}}`;
      case "box": case "borderBox": return arg(n, "e");
      case "eqArr": return `\\begin{aligned}${kids(n, "e").map(conv).join("\\\\")}\\end{aligned}`;
      case "m": return `\\begin{matrix}${kids(n, "mr").map((r) => kids(r, "e").map(conv).join("&")).join("\\\\")}\\end{matrix}`;
      case "e": case "num": case "den": case "sub": case "sup": case "deg": case "fName": case "lim": case "oMath": case "oMathPara": return conv(n);
      case "rPr": case "fPr": case "sSupPr": case "sSubPr": case "sSubSupPr": case "radPr": case "naryPr": case "dPr": case "barPr": case "accPr": case "funcPr": case "ctrlPr": case "limLowPr": case "limUppPr": case "eqArrPr": case "mPr": case "groupChrPr": case "boxPr": case "borderBoxPr": case "sPrePr": case "oMathParaPr": return "";
      default: return conv(n) || textOf(n);
    }
  }
  return one(node).replace(/\s+/g, " ").trim();
}
void val;
