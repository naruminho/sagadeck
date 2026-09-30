// Fórmulas do slide "Fórmulas e funções": "a*sin(b*x)", "y = x² - 2x + 1", "z = sin(x)*cos(y)".
// Sem eval: um analisador pequeno monta funções JS a partir da expressão (só números, variáveis e as funções de
// matemática abaixo). Roda na apresentação (controles deslizantes redesenham a curva) e no Node (o motor
// confere a fórmula e desenha a prévia estática). Letra que não é x/y vira parâmetro: vira controle deslizante.
(function (root) {
  // sem protótipo: "toString", "constructor" e afins não existem aqui
  const FUNCS = Object.assign(Object.create(null), {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sen: Math.sin, tg: Math.tan,
    exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, raiz: Math.sqrt,
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
    min: Math.min, max: Math.max, pow: Math.pow, atan2: Math.atan2,
  });
  const CONSTS = Object.assign(Object.create(null), { pi: Math.PI, e: Math.E });

  // "y = …", "f(x) = …", "z = …": só o lado direito importa; símbolos comuns viram operadores
  function normalize(src) {
    let s = String(src ?? "").trim();
    const eq = s.match(/^\s*(?:[a-zA-Z]\w*\s*(?:\([^)]*\))?)\s*=(?!=)/);
    if (eq) s = s.slice(eq[0].length);
    return s.replace(/[·×⋅]/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "pi").replace(/√/g, "sqrt")
      .replace(/²/g, "^2").replace(/³/g, "^3").replace(/(\d),(\d)/g, "$1.$2");
  }

  function tokenize(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const num = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
      if (num) { out.push({ t: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }
      const id = s.slice(i).match(/^[a-zA-Z_]\w*/);
      if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
      if ("+-*/^(),;".includes(c)) { out.push({ t: c === ";" ? "," : c }); i++; continue; }
      throw new Error(`símbolo "${c}" não entendido`);
    }
    return out;
  }

  // identificador colado vira produto, como numa calculadora gráfica: "ax" = a*x, "xsin(x)" = x*sin(x).
  // Nome de função, constante, variável ou letra grega (alpha, theta…) fica inteiro.
  const GREEK = ["alpha", "beta", "gamma", "delta", "theta", "lambda", "mu", "sigma", "phi", "omega", "tau", "rho", "k0"];
  function splitId(name, vars, callNext) {
    // letra com número (h0, v0, x1) é um nome só
    const whole = (n) => (FUNCS[n] && callNext) || n in CONSTS || vars.includes(n) || GREEK.includes(n) || /^[a-zA-Z][0-9_]*$/.test(n);
    if (whole(name)) return [name];
    // o maior pedaço conhecido no fim (função antes de "(" ou constante), o começo vira letras soltas
    for (let k = 1; k < name.length; k++) {
      const tail = name.slice(k);
      if ((FUNCS[tail] && callNext) || tail in CONSTS || GREEK.includes(tail)) return [...splitId(name.slice(0, k), vars, false), tail];
    }
    return name.match(/[a-zA-Z][0-9_]*/g);
  }

  function parse(src, vars = ["x"]) {
    const raw = tokenize(normalize(src));
    const toks = [];
    raw.forEach((tk, k) => {
      if (tk.t === "id") splitId(tk.v, vars, ["(", "num", "id"].includes(raw[k + 1]?.t)).forEach((v) => toks.push({ t: "id", v }));
      else toks.push(tk);
    });
    // multiplicação implícita: 2x, 2(x+1), (x+1)(x-1), x y, 3sin(x)
    const seq = [];
    toks.forEach((tk, k) => {
      const prev = seq[seq.length - 1];
      // nome de função que ficou inteiro espera o argumento: nada de "*" depois dele
      const endsValue = prev && (prev.t === "num" || prev.t === ")" || (prev.t === "id" && !FUNCS[prev.v]));
      if (endsValue && (tk.t === "num" || tk.t === "id" || tk.t === "(")) seq.push({ t: "*" });
      seq.push(tk);
    });
    let p = 0;
    const params = new Set();
    const peek = () => seq[p], eat = (t) => { if (seq[p]?.t !== t) throw new Error(t === ")" ? "falta fechar parêntese" : `esperava "${t}"`); return seq[p++]; };
    // expr := termo (+|- termo)*; termo := unário (*|/ unário)*; unário := -unário | potência; potência := átomo (^ unário)?
    function expr() {
      let a = term();
      while (peek()?.t === "+" || peek()?.t === "-") { const op = seq[p++].t, l = a, r = term(); a = op === "+" ? (v) => l(v) + r(v) : (v) => l(v) - r(v); }
      return a;
    }
    function term() {
      let a = unary();
      while (peek()?.t === "*" || peek()?.t === "/") { const op = seq[p++].t, l = a, r = unary(); a = op === "*" ? (v) => l(v) * r(v) : (v) => l(v) / r(v); }
      return a;
    }
    function unary() {
      if (peek()?.t === "-") { p++; const a = unary(); return (v) => -a(v); }
      if (peek()?.t === "+") { p++; return unary(); }
      return power();
    }
    function power() {
      const base = atom();
      if (peek()?.t === "^") { p++; const ex = unary(); return (v) => Math.pow(base(v), ex(v)); }
      return base;
    }
    function atom() {
      const tk = seq[p++];
      if (!tk) throw new Error("a fórmula terminou no meio");
      if (tk.t === "num") { const n = tk.v; return () => n; }
      if (tk.t === "(") { const a = expr(); eat(")"); return a; }
      if (tk.t === "id") {
        const name = tk.v;
        if (FUNCS[name] && peek()?.t === "(") {
          p++;
          const args = [expr()];
          while (peek()?.t === ",") { p++; args.push(expr()); }
          eat(")");
          const fn = FUNCS[name];
          return args.length === 1 ? ((a) => (v) => fn(a(v)))(args[0]) : (v) => fn(...args.map((a) => a(v)));
        }
        if (FUNCS[name] && peek() && peek().t !== "," && peek().t !== ")") { const a = power(), fn = FUNCS[name]; return (v) => fn(a(v)); } // "sin x"
        if (FUNCS[name]) throw new Error(`${name} precisa de um valor: ${name}(x)`);
        const read = (v) => (Object.hasOwn(v, name) ? v[name] : NaN); // só valores dados, nunca o protótipo
        if (vars.includes(name)) return read;
        if (name in CONSTS) { const c = CONSTS[name]; return () => c; }
        params.add(name);
        return read;
      }
      throw new Error(tk.t === ")" ? "parêntese fechando sem abrir" : `"${tk.t}" fora do lugar`);
    }
    if (!seq.length) throw new Error("fórmula vazia");
    const fn = expr();
    if (p < seq.length) throw new Error(seq[p].t === ")" ? "parêntese fechando sem abrir" : "sobrou algo no fim da fórmula");
    return { fn, params: [...params] };
  }

  // compila e devolve { eval(vars) -> número ou null, params } ou lança erro em português
  function compile(src, vars) {
    const { fn, params } = parse(src, vars);
    return { params, eval: (v) => { const y = fn(v); return Number.isFinite(y) ? y : null; } };
  }

  // valores das amostras: n pontos no intervalo [a, b]; saltos grandes (tan, 1/x) viram buraco na linha
  // log: pontos espaçados em escala logarítmica (eixo x log, ex.: diagrama de Moody)
  function sample(c, [a, b] = [-10, 10], values = {}, n = 400, log = false) {
    const xs = [], ys = [];
    const la = Math.log10(Math.max(a, 1e-12)), lb = Math.log10(Math.max(b, 1e-12));
    for (let i = 0; i < n; i++) { const x = log ? Math.pow(10, la + ((lb - la) * i) / (n - 1)) : a + ((b - a) * i) / (n - 1); xs.push(+x.toPrecision(8)); ys.push(c.eval({ ...values, x })); }
    const fin = ys.filter((y) => y != null).sort((p, q) => p - q);
    if (fin.length > 10) {
      const lo = fin[Math.floor(fin.length * 0.02)], hi = fin[Math.ceil(fin.length * 0.98) - 1], span = (hi - lo) || 1;
      for (let i = 1; i < n; i++) if (ys[i] != null && ys[i - 1] != null && Math.abs(ys[i] - ys[i - 1]) > span * 4) ys[i] = null;
    }
    return { x: xs, y: ys };
  }

  root.SagaFormula = { compile, sample, FUNCS: Object.keys(FUNCS) };
})(typeof globalThis !== "undefined" ? globalThis : window);
