// Execução rastreada (layout algo com program:): um Python simples interpretado aqui mesmo, sem eval e sem acesso a
// nada fora do programa. Roda o código do professor (o algoritmo que ele inventou, uma árvore, um grafo…) e grava cada
// passo como num depurador: a linha, as variáveis de cada chamada, o que foi lido e escrito e o que saiu no print.
//
// Cobre o que aparece em aula: def (recursão, padrão de parâmetro), class com __init__ e métodos, if/elif/else,
// while, for … in, break/continue, return, listas, tuplas, dicionários, conjuntos, fatiamento, compreensões,
// lambda, f-strings, from collections import deque, import math/heapq e as funções de sempre (len, range, min…).
// Fora disso o erro diz o que não é suportado e em que linha.
//
// Comentário no fim da linha vira a legenda do passo, com {expressão} trocada pelo valor: `j += 1  # agora j = {j}`.

export class PyError extends Error {
  constructor(msg, line) { super(line ? `linha ${line}: ${msg}` : msg); this.pyLine = line; }
}

// ---------------------------------------------------------------------------------------------------- tokens
const OPS = ["**=", "//=", ">>=", "<<=", "**", "//", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "->", "<<", ">>",
  "+", "-", "*", "/", "%", "<", ">", "=", "(", ")", "[", "]", "{", "}", ",", ":", ".", ";", "&", "|", "^", "~"];
const KEYWORDS = new Set(["def", "class", "if", "elif", "else", "while", "for", "in", "not", "and", "or", "is", "return", "break", "continue",
  "pass", "global", "nonlocal", "import", "from", "as", "lambda", "True", "False", "None", "del", "assert"]);

function tokenize(src) {
  const lines = String(src).replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const toks = [], comments = {}, indents = [0];
  let depth = 0, cont = false;
  const opened = [];
  const push = (t, v, line, col, end) => toks.push({ t, v, line, col, end });
  for (let li = 0; li < lines.length; li++) {
    const text = lines[li], line = li + 1;
    let p = 0;
    if (depth === 0 && !cont) {
      const ind = text.match(/^ */)[0].length;
      const rest = text.slice(ind);
      if (!rest.trim() || rest.trimStart().startsWith("#")) continue;
      if (ind > indents.at(-1)) { indents.push(ind); push("INDENT", null, line, 0, 0); }
      while (ind < indents.at(-1)) { indents.pop(); push("DEDENT", null, line, 0, 0); }
      if (ind !== indents.at(-1)) throw new PyError("indentação não bate com as linhas de cima", line);
      p = ind;
    }
    let had = depth > 0 || cont;
    while (p < text.length) {
      const c = text[p];
      if (c === " ") { p++; continue; }
      if (c === "#") { if (had) comments[line] = text.slice(p + 1).trim(); break; }
      if (c === "\\" && p === text.length - 1) break;
      const num = /^(?:\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(text.slice(p));
      if (num && /\d/.test(num[0][0] === "." ? num[0][1] : num[0][0])) { push("NUM", Number(num[0].replace(/_/g, "")), line, p, p + num[0].length); p += num[0].length; had = true; continue; }
      const str = /^([fFrR]{0,2})("""|'''|"|')/.exec(text.slice(p));
      if (str) {
        const pre = str[1].toLowerCase(), q = str[2];
        if (q.length === 3) throw new PyError("texto com três aspas não é suportado; use uma linha só", line);
        let i = p + str[0].length, out = "";
        while (i < text.length && text[i] !== q) {
          if (text[i] === "\\" && !pre.includes("r")) { const n = text[++i]; out += n === "n" ? "\n" : n === "t" ? "\t" : n === "0" ? "\0" : n; i++; continue; }
          out += text[i++];
        }
        if (text[i] !== q) throw new PyError("texto sem aspas de fechamento", line);
        push(pre.includes("f") ? "FSTR" : "STR", out, line, p, i + 1); p = i + 1; had = true; continue;
      }
      const name = /^[A-Za-z_À-ɏ][\wÀ-ɏ]*/.exec(text.slice(p));
      if (name) { push(KEYWORDS.has(name[0]) ? "KW" : "NAME", name[0], line, p, p + name[0].length); p += name[0].length; had = true; continue; }
      const op = OPS.find((o) => text.startsWith(o, p));
      if (!op) throw new PyError(`caractere inesperado "${c}"`, line);
      if ("([{".includes(op)) { depth++; opened.push([op, line]); }
      if (")]}".includes(op)) { depth = Math.max(0, depth - 1); opened.pop(); }
      push("OP", op, line, p, p + op.length); p += op.length; had = true;
    }
    cont = text.trimEnd().endsWith("\\");
    if (depth === 0 && had && !cont) push("NEWLINE", null, line, text.length, text.length);
  }
  if (opened.length) { const [op, l] = opened.at(-1); throw new PyError(`"${op}" aberto e não fechado`, l); }
  while (indents.length > 1) { indents.pop(); push("DEDENT", null, lines.length, 0, 0); }
  push("EOF", null, lines.length + 1, 0, 0);
  return { toks, comments, lines };
}

// ---------------------------------------------------------------------------------------------------- parser
function parse(src) {
  const { toks, comments, lines } = tokenize(src);
  let i = 0;
  const peek = (o = 0) => toks[i + o];
  const is = (t, v, o = 0) => { const k = toks[i + o]; return k.t === t && (v === undefined || k.v === v); };
  const isOp = (v) => is("OP", v), isKw = (v) => is("KW", v);
  const next = () => toks[i++];
  const fail = (msg, k = peek()) => { throw new PyError(msg, k.line); };
  const expect = (t, v) => { if (!is(t, v)) fail(v ? `esperava "${v}"` : `esperava ${t === "NAME" ? "um nome" : t === "NEWLINE" ? "fim da linha" : t}`); return next(); };
  const srcOf = (a, b) => (a.line === b.line ? lines[a.line - 1].slice(a.col, b.end) : lines[a.line - 1].slice(a.col).trim());

  function program() {
    const body = [];
    while (!is("EOF")) { if (is("NEWLINE")) { next(); continue; } body.push(...statement()); }
    return body;
  }
  function block() {
    expect("OP", ":");
    if (is("NEWLINE")) {
      next();
      if (!is("INDENT")) fail("esperava um bloco indentado");
      next();
      const body = [];
      while (!is("DEDENT") && !is("EOF")) body.push(...statement());
      if (is("DEDENT")) next();
      return body;
    }
    return simpleLine();
  }
  function statement() {
    const k = peek();
    if (k.t === "KW") {
      if (k.v === "def") return [funcDef()];
      if (k.v === "class") return [classDef()];
      if (k.v === "if") return [ifStmt()];
      if (k.v === "while") { next(); const test = expr(), end = toks[i - 1]; return [{ k: "While", line: k.line, test, src: srcOf(toks[toks.indexOf(k) + 1], end), body: block() }]; }
      if (k.v === "for") {
        next();
        const target = targetList();
        expect("KW", "in");
        const start = peek(); const iter = testList(); const end = toks[i - 1];
        return [{ k: "For", line: k.line, target, iter, src: srcOf(start, end), body: block() }];
      }
    }
    return simpleLine();
  }
  function simpleLine() {
    const out = [small()];
    while (isOp(";")) { next(); if (is("NEWLINE")) break; out.push(small()); }
    expect("NEWLINE");
    return out;
  }
  function ifStmt() {
    const k = next(); const start = peek(); const test = expr(); const src = srcOf(start, toks[i - 1]);
    const body = block();
    let orelse = [];
    if (isKw("elif")) orelse = [ifStmt()];
    else if (isKw("else")) { next(); orelse = block(); }
    return { k: "If", line: k.line, test, src, body, orelse };
  }
  function params(close) {
    const ps = [];
    while (!isOp(close)) {
      if (isOp("*") || isOp("**")) fail("*args e **kwargs não são suportados");
      const name = expect("NAME").v;
      if (close === ")" && isOp(":")) { next(); expr(); } // anotação de tipo: ignorada
      let def = null;
      if (isOp("=")) { next(); def = expr(); }
      ps.push({ name, def });
      if (!isOp(close)) expect("OP", ",");
    }
    return ps;
  }
  function funcDef() {
    const k = next(); const name = expect("NAME").v;
    expect("OP", "("); const ps = params(")"); expect("OP", ")");
    if (isOp("->")) { next(); expr(); }
    return { k: "Def", line: k.line, name, params: ps, body: block() };
  }
  function classDef() {
    const k = next(); const name = expect("NAME").v;
    if (isOp("(")) { next(); while (!isOp(")")) next(); next(); }
    return { k: "Class", line: k.line, name, body: block() };
  }
  function small() {
    const k = peek();
    if (k.t === "KW") {
      if (k.v === "pass") { next(); return { k: "Pass", line: k.line }; }
      if (k.v === "break") { next(); return { k: "Break", line: k.line }; }
      if (k.v === "continue") { next(); return { k: "Continue", line: k.line }; }
      if (k.v === "return") { next(); const v = is("NEWLINE") || isOp(";") ? null : testList(); return { k: "Return", line: k.line, v, src: v ? srcOf(toks[toks.indexOf(k) + 1], toks[i - 1]) : "" }; }
      if (k.v === "global" || k.v === "nonlocal") { next(); const names = [expect("NAME").v]; while (isOp(",")) { next(); names.push(expect("NAME").v); } return { k: "Global", line: k.line, names, nonlocal: k.v === "nonlocal" }; }
      if (k.v === "import") { next(); const mods = []; do { if (mods.length) next(); let m = expect("NAME").v; while (isOp(".")) { next(); m += "." + expect("NAME").v; } let as = m; if (isKw("as")) { next(); as = expect("NAME").v; } mods.push({ m, as }); } while (isOp(",")); return { k: "Import", line: k.line, mods }; }
      if (k.v === "from") { next(); let m = expect("NAME").v; while (isOp(".")) { next(); m += "." + expect("NAME").v; } expect("KW", "import"); const names = []; do { if (names.length) next(); const n = expect("NAME").v; let as = n; if (isKw("as")) { next(); as = expect("NAME").v; } names.push({ n, as }); } while (isOp(",")); return { k: "FromImport", line: k.line, m, names }; }
      if (k.v === "del") { next(); const t = testList(); return { k: "Del", line: k.line, targets: t.k === "Tuple" ? t.elts : [t] }; }
      if (k.v === "assert") { next(); const test = expr(); let msg = null; if (isOp(",")) { next(); msg = expr(); } return { k: "Assert", line: k.line, test, msg }; }
    }
    const start = peek();
    const first = testList();
    const aug = ["+=", "-=", "*=", "/=", "//=", "%=", "**=", "&=", "|=", "^=", ">>=", "<<="].find((o) => isOp(o));
    if (aug) { next(); const v = testList(); checkTarget(first); return { k: "Aug", line: k.line, target: first, op: aug.slice(0, -1), v, src: srcOf(start, toks[i - 1]) }; }
    if (isOp("=")) {
      const targets = [first];
      let v;
      while (isOp("=")) { next(); v = testList(); targets.push(v); }
      targets.pop(); targets.forEach(checkTarget);
      return { k: "Assign", line: k.line, targets, v, src: srcOf(start, toks[i - 1]) };
    }
    if (isOp(":")) fail("anotação de tipo solta não é suportada");
    return { k: "Expr", line: k.line, e: first, src: srcOf(start, toks[i - 1]) };
  }
  function checkTarget(t) {
    if (t.k === "Name" || t.k === "Sub" || t.k === "Attr") return;
    if (t.k === "Tuple" || t.k === "List") return t.elts.forEach(checkTarget);
    throw new PyError("não dá para atribuir a isso", t.line);
  }
  function targetList() {
    const first = bitOr();
    if (!isOp(",")) return first;
    const elts = [first];
    while (isOp(",")) { next(); if (isKw("in")) break; elts.push(bitOr()); }
    return { k: "Tuple", elts, line: first.line };
  }
  function testList() {
    const first = expr();
    if (!isOp(",")) return first;
    const elts = [first];
    while (isOp(",")) { next(); if (is("NEWLINE") || isOp("=") || isOp(")") || isOp(";")) break; elts.push(expr()); }
    return { k: "Tuple", elts, line: first.line };
  }
  function expr() {
    if (isKw("lambda")) {
      const k = next(); const ps = params(":"); expect("OP", ":");
      return { k: "Lambda", line: k.line, params: ps, body: expr() };
    }
    const e = orTest();
    if (isKw("if")) { next(); const test = orTest(); expect("KW", "else"); return { k: "IfExp", test, body: e, orelse: expr(), line: e.line }; }
    return e;
  }
  function orTest() { let e = andTest(); while (isKw("or")) { next(); e = { k: "BoolOp", op: "or", l: e, r: andTest(), line: e.line }; } return e; }
  function andTest() { let e = notTest(); while (isKw("and")) { next(); e = { k: "BoolOp", op: "and", l: e, r: notTest(), line: e.line }; } return e; }
  function notTest() { if (isKw("not")) { const k = next(); return { k: "Not", e: notTest(), line: k.line }; } return comparison(); }
  function comparison() {
    const l = bitOr(); const ops = [], rs = [];
    for (;;) {
      let op = null;
      if (["<", ">", "==", "!=", "<=", ">="].some((o) => isOp(o))) op = next().v;
      else if (isKw("in")) { next(); op = "in"; }
      else if (isKw("not") && is("KW", "in", 1)) { next(); next(); op = "not in"; }
      else if (isKw("is")) { next(); if (isKw("not")) { next(); op = "is not"; } else op = "is"; }
      if (!op) break;
      ops.push(op); rs.push(bitOr());
    }
    return ops.length ? { k: "Compare", l, ops, rs, line: l.line } : l;
  }
  const binLevel = (sub, opsList) => () => { let e = sub(); while (opsList.some((o) => isOp(o))) { const op = next().v; e = { k: "Bin", op, l: e, r: sub(), line: e.line }; } return e; };
  function factor() {
    if (isOp("-") || isOp("+") || isOp("~")) { const k = next(); return { k: "Unary", op: k.v, e: factor(), line: k.line }; }
    const b = primary();
    if (isOp("**")) { next(); return { k: "Bin", op: "**", l: b, r: factor(), line: b.line }; }
    return b;
  }
  const term = binLevel(factor, ["*", "/", "//", "%"]);
  const arith = binLevel(term, ["+", "-"]);
  const shift = binLevel(arith, ["<<", ">>"]);
  const bitAnd = binLevel(shift, ["&"]);
  const bitXor = binLevel(bitAnd, ["^"]);
  const bitOr = binLevel(bitXor, ["|"]);
  function primary() {
    let e = atom();
    for (;;) {
      if (isOp("(")) {
        next(); const args = [], kw = [];
        while (!isOp(")")) {
          if (is("NAME") && is("OP", "=", 1)) { const n = next().v; next(); kw.push({ n, v: expr() }); }
          else {
            if (isOp("*")) fail("*args não é suportado");
            const a = expr();
            if (isKw("for")) args.push(comprehension("gen", a)); else args.push(a);
          }
          if (!isOp(")")) expect("OP", ",");
        }
        next();
        e = { k: "Call", f: e, args, kw, line: e.line };
      } else if (isOp("[")) {
        next();
        const idx = subscript();
        expect("OP", "]");
        e = { k: "Sub", v: e, i: idx, line: e.line };
      } else if (isOp(".")) {
        next(); e = { k: "Attr", v: e, name: expect("NAME").v, line: e.line };
      } else return e;
    }
  }
  function subscript() {
    const part = () => (isOp(":") || isOp("]") ? null : expr());
    const lo = part();
    if (!isOp(":")) {
      if (isOp(",")) { const elts = [lo]; while (isOp(",")) { next(); if (isOp("]")) break; elts.push(expr()); } return { k: "Tuple", elts, line: lo.line }; }
      return lo;
    }
    next(); const hi = part(); let st = null;
    if (isOp(":")) { next(); st = part(); }
    return { k: "Slice", lo, hi, st };
  }
  function comprehension(kind, elt, key = null) {
    const gens = [];
    while (isKw("for")) {
      next(); const target = targetList(); expect("KW", "in"); const iter = orTest(); const ifs = [];
      while (isKw("if")) { next(); ifs.push(orTestNoCond()); }
      gens.push({ target, iter, ifs });
    }
    return { k: "Comp", kind, elt, key, gens, line: elt.line };
  }
  function orTestNoCond() { return orTest(); }
  function atom() {
    const k = peek();
    if (k.t === "NUM") { next(); return { k: "Const", v: k.v, line: k.line }; }
    if (k.t === "STR" || k.t === "FSTR") {
      const parts = [];
      while (is("STR") || is("FSTR")) { const s = next(); parts.push(s.t === "FSTR" ? fstring(s) : { k: "Const", v: s.v, line: s.line }); }
      return parts.length === 1 ? parts[0] : { k: "Concat", parts, line: k.line };
    }
    if (k.t === "KW") {
      if (k.v === "True") { next(); return { k: "Const", v: true, line: k.line }; }
      if (k.v === "False") { next(); return { k: "Const", v: false, line: k.line }; }
      if (k.v === "None") { next(); return { k: "Const", v: null, line: k.line }; }
      fail(`"${k.v}" fora do lugar`);
    }
    if (k.t === "NAME") { next(); return { k: "Name", id: k.v, line: k.line }; }
    if (isOp("(")) {
      next();
      if (isOp(")")) { next(); return { k: "Tuple", elts: [], line: k.line }; }
      const first = expr();
      if (isKw("for")) { const c = comprehension("gen", first); expect("OP", ")"); return c; }
      if (isOp(")")) { next(); return first; }
      const elts = [first];
      while (isOp(",")) { next(); if (isOp(")")) break; elts.push(expr()); }
      expect("OP", ")");
      return { k: "Tuple", elts, line: k.line };
    }
    if (isOp("[")) {
      next();
      if (isOp("]")) { next(); return { k: "List", elts: [], line: k.line }; }
      const first = expr();
      if (isKw("for")) { const c = comprehension("list", first); expect("OP", "]"); return c; }
      const elts = [first];
      while (isOp(",")) { next(); if (isOp("]")) break; elts.push(expr()); }
      expect("OP", "]");
      return { k: "List", elts, line: k.line };
    }
    if (isOp("{")) {
      next();
      if (isOp("}")) { next(); return { k: "Dict", keys: [], vals: [], line: k.line }; }
      const first = expr();
      if (isOp(":")) {
        next(); const v = expr();
        if (isKw("for")) { const c = comprehension("dict", v, first); expect("OP", "}"); return c; }
        const keys = [first], vals = [v];
        while (isOp(",")) { next(); if (isOp("}")) break; keys.push(expr()); expect("OP", ":"); vals.push(expr()); }
        expect("OP", "}");
        return { k: "Dict", keys, vals, line: k.line };
      }
      if (isKw("for")) { const c = comprehension("set", first); expect("OP", "}"); return c; }
      const elts = [first];
      while (isOp(",")) { next(); if (isOp("}")) break; elts.push(expr()); }
      expect("OP", "}");
      return { k: "SetLit", elts, line: k.line };
    }
    fail(k.t === "EOF" || k.t === "NEWLINE" ? "a linha terminou antes da hora" : `não esperava "${k.v ?? k.t}" aqui`);
  }
  function fstring(tok) {
    const parts = [], s = tok.v;
    let buf = "", p = 0;
    while (p < s.length) {
      if (s[p] === "{" && s[p + 1] === "{") { buf += "{"; p += 2; continue; }
      if (s[p] === "}" && s[p + 1] === "}") { buf += "}"; p += 2; continue; }
      if (s[p] === "{") {
        let q = p + 1, d = 0;
        while (q < s.length && !(s[q] === "}" && d === 0)) { if ("([{".includes(s[q])) d++; if (")]}".includes(s[q])) d--; q++; }
        let code = s.slice(p + 1, q), spec = "";
        const colon = code.search(/:(?![^[]*\])/);
        if (colon > 0 && !code.slice(colon).includes("=")) { spec = code.slice(colon + 1); code = code.slice(0, colon); }
        if (buf) parts.push({ k: "Const", v: buf, line: tok.line }); buf = "";
        parts.push({ k: "Fmt", e: parseExpr(code, tok.line), spec, line: tok.line });
        p = q + 1; continue;
      }
      buf += s[p++];
    }
    if (buf) parts.push({ k: "Const", v: buf, line: tok.line });
    return { k: "Concat", parts, line: tok.line };
  }
  const body = program();
  return { body, comments, lines };
}

export function parseExpr(code, line = 1) {
  let p;
  try { p = parse(String(code).trim()); } catch (e) { throw new PyError(`expressão inválida: ${code}`, line); }
  if (p.body.length !== 1 || p.body[0].k !== "Expr") throw new PyError(`expressão inválida: ${code}`, line);
  return p.body[0].e;
}

// ---------------------------------------------------------------------------------------------------- valores
const TUPLES = new WeakSet(), DEQUES = new WeakSet();
export const tuple = (items) => { const a = [...items]; TUPLES.add(a); return a; };
const deque = (items) => { const a = [...items]; DEQUES.add(a); return a; };
export const isTuple = (x) => Array.isArray(x) && TUPLES.has(x);
export const isDeque = (x) => Array.isArray(x) && DEQUES.has(x);
const keyOf = (k) => (Array.isArray(k) ? "t:" + JSON.stringify(k) : typeof k === "boolean" ? Number(k) : k);
export class PyDict {
  constructor(entries = []) { this.m = new Map(); for (const [k, v] of entries) this.set(k, v); }
  set(k, v) { if (Array.isArray(k) && !isTuple(k)) throw new PyError("lista não pode ser chave de dicionário (use tupla)"); const n = keyOf(k); const e = this.m.get(n); if (e) e[1] = v; else this.m.set(n, [k, v]); }
  get(k) { return this.m.get(keyOf(k)); }
  has(k) { return this.m.has(keyOf(k)); }
  delete(k) { return this.m.delete(keyOf(k)); }
  keys() { return [...this.m.values()].map((e) => e[0]); }
  values() { return [...this.m.values()].map((e) => e[1]); }
  entries() { return [...this.m.values()]; }
  get size() { return this.m.size; }
}
export class PySet {
  constructor(items = []) { this.m = new Map(); for (const x of items) this.add(x); }
  add(x) { if (Array.isArray(x) && !isTuple(x)) throw new PyError("lista não pode entrar num conjunto"); this.m.set(keyOf(x), x); }
  has(x) { return this.m.has(keyOf(x)); }
  delete(x) { return this.m.delete(keyOf(x)); }
  values() { return [...this.m.values()]; }
  get size() { return this.m.size; }
}
class PyRange { constructor(a, b, s) { this.a = a; this.b = b; this.s = s; if (!s) throw new PyError("range com passo 0"); } get length() { return Math.max(0, Math.ceil((this.b - this.a) / this.s)); } at(i) { return this.a + i * this.s; } }
export class PyFunc { constructor(name, params, body, env, line, lambda = false) { Object.assign(this, { name, params, body, env, line, lambda }); } }
class PyBound { constructor(fn, self) { this.fn = fn; this.self = self; } }
class PyBuiltin { constructor(name, fn) { this.name = name; this.fn = fn; } }
export class PyClass { constructor(name, attrs) { this.name = name; this.attrs = attrs; } }
export class PyObj { constructor(cls) { this.cls = cls; this.attrs = Object.create(null); } }
class PyModule { constructor(name, attrs) { this.name = name; this.attrs = attrs; } }

const BREAK = { t: "break" }, CONTINUE = { t: "continue" };
class Ret { constructor(v) { this.v = v; } }

export function typeName(v) {
  if (v === null || v === undefined) return "NoneType";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  if (typeof v === "string") return "str";
  if (isTuple(v)) return "tuple";
  if (isDeque(v)) return "deque";
  if (Array.isArray(v)) return "list";
  if (v instanceof PyDict) return "dict";
  if (v instanceof PySet) return "set";
  if (v instanceof PyRange) return "range";
  if (v instanceof PyObj) return v.cls.name;
  if (v instanceof PyClass) return "type";
  return "function";
}
export function truthy(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof PyDict || v instanceof PySet) return v.size > 0;
  if (v instanceof PyRange) return v.length > 0;
  return true;
}
const fmtNum = (n) => {
  if (n === Infinity) return "inf"; if (n === -Infinity) return "-inf"; if (Number.isNaN(n)) return "nan";
  if (Number.isInteger(n)) return String(n);
  return String(+n.toPrecision(12));
};
export function repr(v, deep = 0, seen = new Set()) {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True"; if (v === false) return "False";
  if (typeof v === "number") return fmtNum(v);
  if (typeof v === "string") return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
  if (typeof v === "object" && seen.has(v)) return "…";
  if (typeof v === "object") seen = new Set([...seen, v]);
  if (deep > 6) return "…";
  const r = (x) => repr(x, deep + 1, seen);
  if (isTuple(v)) return `(${v.map(r).join(", ")}${v.length === 1 ? "," : ""})`;
  if (isDeque(v)) return `deque([${v.map(r).join(", ")}])`;
  if (Array.isArray(v)) return `[${v.map(r).join(", ")}]`;
  if (v instanceof PyDict) return `{${v.entries().map(([k, x]) => `${r(k)}: ${r(x)}`).join(", ")}}`;
  if (v instanceof PySet) return v.size ? `{${v.values().map(r).join(", ")}}` : "set()";
  if (v instanceof PyRange) return `range(${v.a}, ${v.b}${v.s !== 1 ? ", " + v.s : ""})`;
  if (v instanceof PyObj) { const lab = nodeLabel(v); return `${v.cls.name}(${lab === undefined ? "" : r(lab)})`; }
  if (v instanceof PyClass) return `<classe ${v.name}>`;
  if (v instanceof PyFunc) return `<função ${v.name}>`;
  if (v instanceof PyBound) return `<método ${v.fn.name}>`;
  if (v instanceof PyBuiltin) return `<função ${v.name}>`;
  if (v instanceof PyModule) return `<módulo ${v.name}>`;
  return String(v);
}
export const str = (v) => (typeof v === "string" ? v : repr(v));
// valor que representa o nó (árvore, lista ligada): o primeiro atributo simples com nome de valor
const LABEL_KEYS = ["valor", "val", "value", "chave", "key", "dado", "data", "info", "item", "nome", "name", "v", "x"];
export function nodeLabel(o) {
  const a = o.attrs;
  for (const k of LABEL_KEYS) if (k in a && !(a[k] instanceof PyObj) && !Array.isArray(a[k])) return a[k];
  for (const k in a) { const x = a[k]; if (x === null || typeof x !== "object") return x; }
  return undefined;
}

function pyEq(a, b) {
  if (a === b) return true;
  if ((typeof a === "number" || typeof a === "boolean") && (typeof b === "number" || typeof b === "boolean")) return Number(a) === Number(b);
  if (Array.isArray(a) && Array.isArray(b)) return isTuple(a) === isTuple(b) && a.length === b.length && a.every((x, i) => pyEq(x, b[i]));
  if (a instanceof PyDict && b instanceof PyDict) return a.size === b.size && a.entries().every(([k, v]) => b.has(k) && pyEq(v, b.get(k)[1]));
  if (a instanceof PySet && b instanceof PySet) return a.size === b.size && a.values().every((x) => b.has(x));
  return false;
}
function pyLt(a, b, line) {
  if ((typeof a === "number" || typeof a === "boolean") && (typeof b === "number" || typeof b === "boolean")) return Number(a) < Number(b);
  if (typeof a === "string" && typeof b === "string") return a < b;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (!pyEq(a[i], b[i])) return pyLt(a[i], b[i], line);
    return a.length < b.length;
  }
  throw new PyError(`não dá para comparar ${typeName(a)} com ${typeName(b)} usando <`, line);
}
const isNum = (x) => typeof x === "number" || typeof x === "boolean";

// ---------------------------------------------------------------------------------------------------- execução
export function runProgram(source, { call = null, maxOps = 50000, maxSteps = 4000, watch = [] } = {}) {
  const ast = parse(source);
  const steps = [];
  const out = [];
  let ops = 0;
  const ids = new WeakMap(); let nextId = 1;
  const idOf = (o) => { let n = ids.get(o); if (!n) { n = nextId++; ids.set(o, n); } return n; };
  const globals = { vars: Object.create(null), parent: null, globalNames: new Set(), fname: "<programa>" };
  const stack = [{ name: "<programa>", env: globals, line: 0 }];
  let ev = { reads: [], writes: [], matches: [] };

  const tick = (line) => { if (++ops > maxOps) throw new PyError(`passou de ${maxOps} operações: laço sem fim, ou a entrada é grande demais para o passo a passo`, line); };

  // ---------------- retrato do estado (para a tela): variáveis de cada chamada e o que elas apontam
  const watched = watch.map((w) => { try { return [w, parseExpr(w)]; } catch { return [w, null]; } });
  function snapshot(kind, line, text, env, extra = {}) {
    if (steps.length >= maxSteps) throw new PyError(`passou de ${maxSteps} passos (laço sem fim? senão, use uma entrada menor)`, line);
    const heap = {};
    const val = (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v !== "object") return v;
      if (v instanceof PyRange || v instanceof PyFunc || v instanceof PyBuiltin || v instanceof PyBound || v instanceof PyClass || v instanceof PyModule) return { repr: repr(v) };
      const id = idOf(v);
      if (!heap[id]) {
        heap[id] = { t: typeName(v) };
        const node = heap[id];
        if (Array.isArray(v)) node.items = v.map(val);
        else if (v instanceof PyDict) node.entries = v.entries().map(([k, x]) => [val(k), val(x)]);
        else if (v instanceof PySet) node.items = v.values().map(val);
        else if (v instanceof PyObj) { node.cls = v.cls.name; node.attrs = Object.fromEntries(Object.keys(v.attrs).map((k) => [k, val(v.attrs[k])])); node.label = val(nodeLabel(v)); }
      }
      return { ref: id };
    };
    const frames = stack.map((f) => ({ name: f.name, params: f.params, vars: Object.fromEntries(Object.keys(f.env.vars).filter((k) => !isHidden(f.env.vars[k])).map((k) => [k, val(f.env.vars[k])])) }));
    const w = {};
    for (const [code, e] of watched) { if (!e) continue; try { const v = evalExprQuiet(e, env); if (v === null || typeof v !== "object") w[code] = v; else w[code] = val(v); } catch { /* ainda não existe nesta chamada */ } }
    const st = { kind, line, text, frames, heap, reads: ev.reads, writes: ev.writes, matches: ev.matches, out: out.slice(-6), watch: w, ...extra };
    steps.push(st);
    ev = { reads: [], writes: [], matches: [] };
    return st;
  }
  const isHidden = (v) => v instanceof PyFunc || v instanceof PyBuiltin || v instanceof PyClass || v instanceof PyModule;

  // legenda do passo: o comentário da linha (com {expressão}) ou uma descrição do que aconteceu
  function caption(line, env, auto) {
    const c = ast.comments[line];
    if (c) {
      try {
        return c.replace(/\{([^{}]+)\}/g, (_, code) => { try { return str(evalExprQuiet(parseExpr(code, line), env)); } catch { return `{${code}}`; } });
      } catch { return c; }
    }
    return auto;
  }
  const step = (kind, line, env, auto, extra) => snapshot(kind, line, caption(line, env, auto), env, extra);

  // ---------------- nomes
  function lookup(name, env, line) {
    for (let e = env; e; e = e.parent) if (name in e.vars) return e.vars[name];
    if (name in globals.vars) return globals.vars[name];
    if (name in BUILTINS) return BUILTINS[name];
    throw new PyError(`"${name}" não existe (ainda não recebeu valor?)`, line);
  }
  function assignName(name, v, env) {
    if (env.globalNames.has(name)) { globals.vars[name] = v; return; }
    if (env.nonlocalNames?.has(name)) { for (let e = env.parent; e; e = e.parent) if (name in e.vars) { e.vars[name] = v; return; } }
    env.vars[name] = v;
  }
  function assign(target, v, env) {
    if (target.k === "Name") return assignName(target.id, v, env);
    if (target.k === "Tuple" || target.k === "List") {
      const items = [...iterate(v, target.line)];
      if (items.length !== target.elts.length) throw new PyError(`esperava ${target.elts.length} valores para desempacotar e veio ${items.length}`, target.line);
      return target.elts.forEach((t, i) => assign(t, items[i], env));
    }
    if (target.k === "Sub") {
      const obj = evalExpr(target.v, env), idx = evalExpr(target.i, env);
      if (Array.isArray(obj)) {
        if (isTuple(obj)) throw new PyError("tupla não muda depois de criada", target.line);
        if (target.i.k === "Slice") throw new PyError("atribuir a uma fatia não é suportado", target.line);
        const i = normIndex(obj, idx, target.line);
        obj[i] = v; ev.writes.push([idOf(obj), i]); return;
      }
      if (obj instanceof PyDict) { obj.set(idx, v); ev.writes.push([idOf(obj), keyOf(idx)]); return; }
      if (typeof obj === "string") throw new PyError("texto não muda depois de criado (monte um novo)", target.line);
      throw new PyError(`${typeName(obj)} não aceita [ ] = `, target.line);
    }
    if (target.k === "Attr") {
      const obj = evalExpr(target.v, env);
      if (obj instanceof PyObj) { obj.attrs[target.name] = v; ev.writes.push([idOf(obj), target.name]); return; }
      if (obj instanceof PyClass) { obj.attrs[target.name] = v; return; }
      throw new PyError(`não dá para criar atributo em ${typeName(obj)}`, target.line);
    }
    throw new PyError("não dá para atribuir a isso", target.line);
  }
  function normIndex(arr, idx, line) {
    if (typeof idx === "boolean") idx = Number(idx);
    if (typeof idx !== "number" || !Number.isInteger(idx)) throw new PyError(`índice precisa ser inteiro (veio ${repr(idx)})`, line);
    const n = arr.length, i = idx < 0 ? n + idx : idx;
    if (i < 0 || i >= n) throw new PyError(`índice ${idx} fora da lista (tamanho ${n})`, line);
    return i;
  }

  // ---------------- expressões
  function evalExpr(e, env) {
    switch (e.k) {
      case "Const": return e.v;
      case "Name": return lookup(e.id, env, e.line);
      case "Concat": return e.parts.map((p) => (p.k === "Fmt" ? format(evalExpr(p.e, env), p.spec, p.line) : evalExpr(p, env))).join("");
      case "Tuple": return tuple(e.elts.map((x) => evalExpr(x, env)));
      case "List": return e.elts.map((x) => evalExpr(x, env));
      case "SetLit": return new PySet(e.elts.map((x) => evalExpr(x, env)));
      case "Dict": return new PyDict(e.keys.map((k, i) => [evalExpr(k, env), evalExpr(e.vals[i], env)]));
      case "Comp": return comprehension(e, env);
      case "Not": return !truthy(evalExpr(e.e, env));
      case "BoolOp": { const l = evalExpr(e.l, env); if (e.op === "and" ? !truthy(l) : truthy(l)) return l; return evalExpr(e.r, env); }
      case "IfExp": return truthy(evalExpr(e.test, env)) ? evalExpr(e.body, env) : evalExpr(e.orelse, env);
      case "Unary": { const v = evalExpr(e.e, env); if (!isNum(v)) throw new PyError(`sinal ${e.op} em ${typeName(v)}`, e.line); return e.op === "-" ? -v : e.op === "+" ? +v : ~v; }
      case "Bin": return binop(e.op, evalExpr(e.l, env), evalExpr(e.r, env), e.line);
      case "Compare": {
        let l = evalExpr(e.l, env);
        const lread = e.l.k === "Sub" ? ev.reads.at(-1) : null;
        for (let k = 0; k < e.ops.length; k++) {
          const r = evalExpr(e.rs[k], env);
          const rread = e.rs[k].k === "Sub" ? ev.reads.at(-1) : null;
          const ok = compare(e.ops[k], l, r, e.line);
          if ((e.ops[k] === "==" || e.ops[k] === "!=") && (lread || rread) && k === 0) ev.matches.push({ reads: [lread, rread].filter(Boolean), eq: pyEq(l, r) });
          if (!ok) return false;
          l = r;
        }
        return true;
      }
      case "Sub": {
        const obj = evalExpr(e.v, env);
        if (e.i.k === "Slice") {
          const lo = e.i.lo ? evalExpr(e.i.lo, env) : null, hi = e.i.hi ? evalExpr(e.i.hi, env) : null, st = e.i.st ? evalExpr(e.i.st, env) : null;
          return slice(obj, lo, hi, st, e.line);
        }
        const idx = evalExpr(e.i, env);
        if (Array.isArray(obj)) { const i = normIndex(obj, idx, e.line); ev.reads.push([idOf(obj), i]); return obj[i]; }
        if (typeof obj === "string") { const i = normIndex(obj, idx, e.line); ev.reads.push(["s", obj, i]); return obj[i]; }
        if (obj instanceof PyDict) { const en = obj.get(idx); if (!en) throw new PyError(`a chave ${repr(idx)} não está no dicionário`, e.line); ev.reads.push([idOf(obj), keyOf(idx)]); return en[1]; }
        if (obj instanceof PyRange) { const i = normIndex({ length: obj.length }, idx, e.line); return obj.at(i); }
        throw new PyError(`${typeName(obj)} não aceita [ ]`, e.line);
      }
      case "Attr": return getAttr(evalExpr(e.v, env), e.name, e.line);
      case "Call": {
        const f = evalExpr(e.f, env);
        const args = e.args.map((a) => evalExpr(a, env));
        const kw = Object.fromEntries(e.kw.map((k) => [k.n, evalExpr(k.v, env)]));
        return callValue(f, args, kw, e.line);
      }
      case "Lambda": return new PyFunc("lambda", e.params, e.body, env, e.line, true);
      case "Slice": throw new PyError("fatia fora de [ ]", e.line);
      default: throw new PyError(`expressão não suportada (${e.k})`, e.line);
    }
  }
  function format(v, spec, line) {
    if (!spec) return str(v);
    const m = /^(\d*)(?:\.(\d+))?([fdse%]?)$/.exec(spec);
    if (!m) throw new PyError(`formato {:${spec}} não suportado`, line);
    let s = m[3] === "f" || m[2] ? Number(v).toFixed(Number(m[2] ?? 6)) : m[3] === "%" ? (Number(v) * 100).toFixed(Number(m[2] ?? 6)) + "%" : str(v);
    if (m[1]) s = s.padStart(Number(m[1]));
    return s;
  }
  function comprehension(e, env) {
    const inner = { vars: Object.create(null), parent: env, globalNames: new Set(), fname: env.fname };
    const res = [];
    const loop = (g) => {
      if (g === e.gens.length) { res.push(e.kind === "dict" ? [evalExpr(e.key, inner), evalExpr(e.elt, inner)] : evalExpr(e.elt, inner)); return; }
      const gen = e.gens[g];
      for (const x of iterate(evalExpr(gen.iter, inner), e.line)) {
        tick(e.line);
        assign(gen.target, x, inner);
        if (gen.ifs.every((c) => truthy(evalExpr(c, inner)))) loop(g + 1);
      }
    };
    loop(0);
    if (e.kind === "set") return new PySet(res);
    if (e.kind === "dict") return new PyDict(res);
    return res;
  }
  function slice(obj, lo, hi, st, line) {
    const step = st ?? 1;
    if (step === 0) throw new PyError("fatia com passo 0", line);
    const n = obj.length;
    const norm = (x, d) => (x === null ? d : x < 0 ? Math.max(step < 0 ? -1 : 0, n + x) : Math.min(step < 0 ? n - 1 : n, x));
    const a = norm(lo, step > 0 ? 0 : n - 1), b = norm(hi, step > 0 ? n : -1);
    const items = [];
    for (let i = a; step > 0 ? i < b : i > b; i += step) items.push(typeof obj === "string" ? obj[i] : obj[i]);
    if (typeof obj === "string") return items.join("");
    if (Array.isArray(obj)) return isTuple(obj) ? tuple(items) : items;
    throw new PyError(`${typeName(obj)} não aceita fatia`, line);
  }
  function compare(op, a, b, line) {
    switch (op) {
      case "==": return pyEq(a, b);
      case "!=": return !pyEq(a, b);
      case "<": return pyLt(a, b, line);
      case ">": return pyLt(b, a, line);
      case "<=": return !pyLt(b, a, line);
      case ">=": return !pyLt(a, b, line);
      case "is": return a === b || (a == null && b == null);
      case "is not": return !(a === b || (a == null && b == null));
      case "in": return contains(b, a, line);
      case "not in": return !contains(b, a, line);
    }
    throw new PyError(`comparação ${op}`, line);
  }
  function contains(c, x, line) {
    if (typeof c === "string") { if (typeof x !== "string") throw new PyError("in num texto precisa de texto", line); return c.includes(x); }
    if (Array.isArray(c)) return c.some((y) => pyEq(x, y));
    if (c instanceof PyDict || c instanceof PySet) return c.has(x);
    if (c instanceof PyRange) return typeof x === "number" && [...iterate(c)].includes(x);
    throw new PyError(`in não funciona com ${typeName(c)}`, line);
  }
  function binop(op, a, b, line) {
    if (op === "+") {
      if (isNum(a) && isNum(b)) return Number(a) + Number(b);
      if (typeof a === "string" && typeof b === "string") return a + b;
      if (Array.isArray(a) && Array.isArray(b)) { const r = [...a, ...b]; return isTuple(a) ? tuple(r) : r; }
      throw new PyError(`não dá para somar ${typeName(a)} com ${typeName(b)}`, line);
    }
    if (op === "*") {
      if (isNum(a) && isNum(b)) return Number(a) * Number(b);
      const [s, n] = typeof b === "number" ? [a, b] : [b, a];
      if (typeof s === "string" && typeof n === "number") return s.repeat(Math.max(0, n));
      if (Array.isArray(s) && typeof n === "number") { if (s.length * n > 100000) throw new PyError("lista grande demais", line); const r = []; for (let k = 0; k < n; k++) r.push(...s); return isTuple(s) ? tuple(r) : r; }
      throw new PyError(`não dá para multiplicar ${typeName(a)} por ${typeName(b)}`, line);
    }
    if (op === "%" && typeof a === "string") throw new PyError("formatação com % não é suportada; use f-string", line);
    if (!isNum(a) || !isNum(b)) {
      if (op === "-" && a instanceof PySet && b instanceof PySet) return new PySet(a.values().filter((x) => !b.has(x)));
      if (op === "|" && a instanceof PySet && b instanceof PySet) return new PySet([...a.values(), ...b.values()]);
      if (op === "&" && a instanceof PySet && b instanceof PySet) return new PySet(a.values().filter((x) => b.has(x)));
      throw new PyError(`operação ${op} entre ${typeName(a)} e ${typeName(b)}`, line);
    }
    a = Number(a); b = Number(b);
    switch (op) {
      case "-": return a - b;
      case "/": if (b === 0) throw new PyError("divisão por zero", line); return a / b;
      case "//": if (b === 0) throw new PyError("divisão por zero", line); return Math.floor(a / b);
      case "%": if (b === 0) throw new PyError("divisão por zero", line); return ((a % b) + b) % b;
      case "**": return a ** b;
      case "<<": return a << b; case ">>": return a >> b;
      case "&": return a & b; case "|": return a | b; case "^": return a ^ b;
    }
    throw new PyError(`operação ${op}`, line);
  }
  function* iterate(v, line) {
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield v[i]; return; }
    if (typeof v === "string") { yield* v; return; }
    if (v instanceof PyRange) { for (let i = 0; i < v.length; i++) yield v.at(i); return; }
    if (v instanceof PyDict) { yield* v.keys(); return; }
    if (v instanceof PySet) { yield* v.values(); return; }
    throw new PyError(`não dá para percorrer ${typeName(v)} com for`, line);
  }
  const list = (v, line) => [...iterate(v, line)];

  function getAttr(o, name, line) {
    if (o instanceof PyObj) {
      if (name in o.attrs) { ev.reads.push([idOf(o), name]); return o.attrs[name]; }
      const m = o.cls.attrs[name];
      if (m instanceof PyFunc) return new PyBound(m, o);
      if (m !== undefined) return m;
      throw new PyError(`${o.cls.name} não tem "${name}"`, line);
    }
    if (o instanceof PyClass) { if (name in o.attrs) return o.attrs[name]; throw new PyError(`${o.name} não tem "${name}"`, line); }
    if (o instanceof PyModule) { if (name in o.attrs) return o.attrs[name]; throw new PyError(`${o.name}.${name} não é suportado`, line); }
    const m = METHODS[typeName(o) === "deque" ? "deque" : typeName(o)]?.[name] ?? (Array.isArray(o) ? METHODS.list[name] : undefined);
    if (m) return new PyBuiltin(name, (args, kw) => m(o, args, kw, line));
    throw new PyError(`${typeName(o)} não tem "${name}"`, line);
  }

  function callValue(f, args, kw, line) {
    tick(line);
    if (f instanceof PyBuiltin) return f.fn(args, kw, line);
    if (f instanceof PyBound) return callFunc(f.fn, [f.self, ...args], kw, line);
    if (f instanceof PyFunc) return callFunc(f, args, kw, line);
    if (f instanceof PyClass) {
      const o = new PyObj(f);
      const init = f.attrs.__init__;
      if (init instanceof PyFunc) callFunc(init, [o, ...args], kw, line);
      else if (args.length) throw new PyError(`${f.name}() não recebe valores (falta o __init__)`, line);
      return o;
    }
    throw new PyError(`${typeName(f)} não é função`, line);
  }
  function callFunc(fn, args, kw, line) {
    if (stack.length > 60) throw new PyError("recursão funda demais (mais de 60 chamadas abertas)", line);
    const env = { vars: Object.create(null), parent: fn.env, globalNames: new Set(), nonlocalNames: new Set(), fname: fn.name };
    fn.params.forEach((p, k) => {
      if (k < args.length) env.vars[p.name] = args[k];
      else if (p.name in kw) env.vars[p.name] = kw[p.name];
      else if (p.def) env.vars[p.name] = evalExpr(p.def, fn.env);
      else throw new PyError(`${fn.name}() precisa do valor de "${p.name}"`, line);
    });
    if (args.length > fn.params.length) throw new PyError(`${fn.name}() recebeu valores demais`, line);
    if (fn.lambda) return evalExpr(fn.body, env);
    const shown = fn.params.filter((p) => p.name !== "self").map((p) => repr(env.vars[p.name])).join(", ");
    stack.push({ name: fn.name, env, line: fn.line, params: fn.params.map((p) => p.name) });
    try {
      step("call", fn.line, env, `Chama ${fn.name}(${shown.length > 60 ? shown.slice(0, 57) + "…" : shown}).`);
      const r = execBlock(fn.body, env);
      const v = r instanceof Ret ? r.v : null;
      return v;
    } finally { stack.pop(); }
  }

  // ---------------- comandos
  function execBlock(body, env) {
    for (const s of body) {
      const r = exec(s, env);
      if (r) return r;
    }
    return null;
  }
  function exec(s, env) {
    tick(s.line);
    switch (s.k) {
      case "Expr": {
        const v = evalExpr(s.e, env);
        step("line", s.line, env, (s.e.k === "Call" ? callText(s.e, env, s.src) : s.src) + (v !== null && v !== undefined ? ` → ${repr(v)}` : ""));
        return null;
      }
      case "Assign": {
        const v = evalExpr(s.v, env);
        for (const t of s.targets) assign(t, v, env);
        step("line", s.line, env, describeAssign(s.targets, env, s.src));
        return null;
      }
      case "Aug": {
        const cur = evalExpr(s.target, env);
        const v = binop(s.op, cur, evalExpr(s.v, env), s.line);
        if (Array.isArray(cur) && s.op === "+" && !isTuple(cur)) { cur.length = 0; cur.push(...v); }
        else assign(s.target, v, env);
        step("line", s.line, env, describeAssign([s.target], env, s.src));
        return null;
      }
      case "If": {
        const ok = truthy(evalExpr(s.test, env));
        step("test", s.line, env, testText(s.test, env, s.src, ok), { test: ok });
        return ok ? execBlock(s.body, env) : execBlock(s.orelse, env);
      }
      case "While": {
        for (;;) {
          const ok = truthy(evalExpr(s.test, env));
          step("test", s.line, env, testText(s.test, env, s.src, ok), { test: ok });
          if (!ok) return null;
          const r = execBlock(s.body, env);
          if (r === BREAK) return null;
          if (r === CONTINUE) continue;
          if (r) return r;
        }
      }
      case "For": {
        const it = evalExpr(s.iter, env);
        const items = Array.isArray(it) ? [...it] : list(it, s.line);
        for (const x of items) {
          tick(s.line);
          assign(s.target, x, env);
          step("loop", s.line, env, describeAssign([s.target], env, s.src));
          const r = execBlock(s.body, env);
          if (r === BREAK) return null;
          if (r === CONTINUE) continue;
          if (r) return r;
        }
        return null;
      }
      case "Def": { assignName(s.name, new PyFunc(s.name, s.params, s.body, env, s.line), env); return null; }
      case "Class": {
        const cenv = { vars: Object.create(null), parent: env, globalNames: new Set(), fname: s.name };
        execBlock(s.body, cenv);
        for (const k in cenv.vars) if (cenv.vars[k] instanceof PyFunc) cenv.vars[k].env = env; // método não enxerga a classe como escopo (igual ao Python)
        assignName(s.name, new PyClass(s.name, cenv.vars), env);
        return null;
      }
      case "Return": {
        const v = s.v ? evalExpr(s.v, env) : null;
        step("return", s.line, env, `Devolve ${repr(v).length > 60 ? repr(v).slice(0, 57) + "…" : repr(v)}.`, { ret: repr(v) });
        return new Ret(v);
      }
      case "Break": return BREAK;
      case "Continue": return CONTINUE;
      case "Pass": return null;
      case "Global": if (env !== globals) s.names.forEach((n) => (s.nonlocal ? env.nonlocalNames : env.globalNames).add(n)); return null;
      case "Import": for (const { m, as } of s.mods) { if (!MODULES[m]) throw new PyError(`módulo ${m} não é suportado (tem: ${Object.keys(MODULES).join(", ")})`, s.line); assignName(as, MODULES[m], env); } return null;
      case "FromImport": {
        const mod = MODULES[s.m];
        if (!mod) throw new PyError(`módulo ${s.m} não é suportado (tem: ${Object.keys(MODULES).join(", ")})`, s.line);
        for (const { n, as } of s.names) { if (!(n in mod.attrs)) throw new PyError(`${s.m}.${n} não é suportado`, s.line); assignName(as, mod.attrs[n], env); }
        return null;
      }
      case "Del": {
        for (const t of s.targets) {
          if (t.k === "Name") delete env.vars[t.id];
          else if (t.k === "Sub") { const o = evalExpr(t.v, env), k = evalExpr(t.i, env); if (Array.isArray(o)) o.splice(normIndex(o, k, s.line), 1); else if (o instanceof PyDict) o.delete(k); }
        }
        step("line", s.line, env, "Apaga.");
        return null;
      }
      case "Assert": if (!truthy(evalExpr(s.test, env))) throw new PyError(`assert falhou${s.msg ? ": " + str(evalExpr(s.msg, env)) : ""}`, s.line); return null;
    }
    throw new PyError(`comando não suportado (${s.k})`, s.line);
  }
  function describeAssign(targets, env, src) {
    const parts = [];
    const walk = (t) => {
      if (t.k === "Tuple" || t.k === "List") return t.elts.forEach(walk);
      try { parts.push(pure(t) ? `${exprText(t, env)} = ${repr(evalExprQuiet(t, env))}` : src); } catch { parts.push(src); }
    };
    targets.forEach(walk);
    return parts.join(" · ");
  }
  // texto de um alvo com os índices já calculados: v[j+1] vira v[3]
  function exprText(t, env) {
    if (t.k === "Name") return t.id;
    if (t.k === "Attr") return `${exprText(t.v, env)}.${t.name}`;
    if (t.k === "Sub") return `${exprText(t.v, env)}[${pure(t.i) ? repr(evalExprQuiet(t.i, env)) : "…"}]`;
    if (t.k === "Call" || !pure(t)) return "…";
    return repr(evalExprQuiet(t, env));
  }
  // legendas com os valores: "v[j] > v[j + 1] → 5 > 3: sim." e "ordem.append('B')". Só recalcula o que não tem
  // efeito colateral (nada de chamar função do programa ou método que mexe na lista de novo)
  const PURE = new Set(["len", "abs", "min", "max", "str", "int", "float", "sum", "sorted", "round", "ord", "chr", "bool"]);
  function pure(e) {
    if (!e || typeof e !== "object") return true;
    if (e.k === "Call") return e.f.k === "Name" && PURE.has(e.f.id) && !(e.f.id in globals.vars) && e.args.every(pure) && e.kw.every((k) => pure(k.v));
    if (e.k === "Lambda" || e.k === "Comp") return false;
    return Object.values(e).every((x) => (Array.isArray(x) ? x.every(pure) : x && typeof x === "object" && x.k ? pure(x) : true));
  }
  function valText(e, env) {
    if (e.k === "Compare") {
      const parts = [repr(evalExprQuiet(e.l, env))];
      for (let k = 0; k < e.ops.length; k++) parts.push(e.ops[k], repr(evalExprQuiet(e.rs[k], env)));
      return parts.join(" ");
    }
    if (e.k === "BoolOp") {
      const l = valText(e.l, env), lv = truthy(evalExprQuiet(e.l, env));
      if (e.op === "and" ? !lv : lv) return l;
      return `${l} ${e.op === "and" ? "e" : "ou"} ${valText(e.r, env)}`;
    }
    if (e.k === "Not") return `not ${valText(e.e, env)}`;
    return repr(evalExprQuiet(e, env));
  }
  function testText(test, env, src, ok) {
    let v = null;
    if (!["Name", "Const", "Call", "Attr"].includes(test.k) && pure(test)) { try { v = valText(test, env); } catch { v = null; } }
    return v && v !== src ? `${src} → ${v}: ${ok ? "sim" : "não"}.` : `${src}? ${ok ? "sim" : "não"}.`;
  }
  function callText(e, env, src) {
    if (!e.args.every(pure) || !e.kw.every((k) => pure(k.v))) return src;
    try {
      const f = e.f.k === "Name" ? e.f.id : e.f.k === "Attr" ? `${exprText(e.f.v, env)}.${e.f.name}` : null;
      if (!f) return src;
      return `${f}(${[...e.args.map((a) => repr(evalExprQuiet(a, env))), ...e.kw.map((k) => `${k.n}=${repr(evalExprQuiet(k.v, env))}`)].join(", ")})`;
    } catch { return src; }
  }
  function evalExprQuiet(e, env) { const saved = ev; ev = { reads: [], writes: [], matches: [] }; try { return evalExpr(e, env); } finally { ev = saved; } }

  // ---------------- funções prontas
  const B = (name, fn) => new PyBuiltin(name, fn);
  const one = (args, name, line) => { if (args.length < 1) throw new PyError(`${name}() precisa de um valor`, line); return args[0]; };
  const minmax = (dir) => (args, kw, line) => {
    const items = args.length === 1 ? list(args[0], line) : args;
    if (!items.length) throw new PyError(`${dir < 0 ? "min" : "max"}() de lista vazia`, line);
    const key = kw.key ? (x) => callValue(kw.key, [x], {}, line) : (x) => x;
    return items.reduce((best, x) => ((dir < 0 ? pyLt(key(x), key(best), line) : pyLt(key(best), key(x), line)) ? x : best));
  };
  const sortList = (items, kw, line) => {
    const key = kw.key ? (x) => callValue(kw.key, [x], {}, line) : (x) => x;
    const keyed = items.map((x) => [key(x), x]);
    keyed.sort((a, b) => (pyLt(a[0], b[0], line) ? -1 : pyLt(b[0], a[0], line) ? 1 : 0));
    const r = keyed.map((p) => p[1]);
    return truthy(kw.reverse) ? r.reverse() : r;
  };
  const BUILTINS = {
    print: B("print", (args, kw) => { out.push(args.map(str).join(kw.sep ?? " ")); return null; }),
    len: B("len", (args, kw, line) => { const v = one(args, "len", line); if (typeof v === "string" || Array.isArray(v)) return v.length; if (v instanceof PyDict || v instanceof PySet) return v.size; if (v instanceof PyRange) return v.length; throw new PyError(`len() de ${typeName(v)}`, line); }),
    range: B("range", (args, kw, line) => { if (!args.every((x) => Number.isInteger(Number(x)))) throw new PyError("range() só com inteiros", line); const [a, b, s] = args.length === 1 ? [0, args[0], 1] : [args[0], args[1], args[2] ?? 1]; return new PyRange(Number(a), Number(b), Number(s)); }),
    min: B("min", minmax(-1)), max: B("max", minmax(1)),
    sum: B("sum", (args, kw, line) => list(args[0], line).reduce((s, x) => binop("+", s, x, line), args[1] ?? 0)),
    abs: B("abs", (args) => Math.abs(args[0])),
    round: B("round", (args) => (args[1] ? +Number(args[0]).toFixed(args[1]) : Math.round(args[0]))),
    int: B("int", (args, kw, line) => { const v = args[0] ?? 0; if (typeof v === "string") { const n = parseInt(v, args[1] ?? 10); if (Number.isNaN(n)) throw new PyError(`int("${v}") não é número`, line); return n; } return Math.trunc(Number(v)); }),
    float: B("float", (args, kw, line) => { const v = args[0] ?? 0; if (typeof v === "string") { const s = v.trim().toLowerCase(); if (s === "inf" || s === "infinity") return Infinity; if (s === "-inf") return -Infinity; const n = Number(s); if (Number.isNaN(n)) throw new PyError(`float("${v}") não é número`, line); return n; } return Number(v); }),
    str: B("str", (args) => str(args[0] ?? "")),
    bool: B("bool", (args) => truthy(args[0])),
    list: B("list", (args, kw, line) => (args.length ? list(args[0], line) : [])),
    tuple: B("tuple", (args, kw, line) => tuple(args.length ? list(args[0], line) : [])),
    set: B("set", (args, kw, line) => new PySet(args.length ? list(args[0], line) : [])),
    dict: B("dict", (args, kw, line) => { const d = new PyDict(args.length ? (args[0] instanceof PyDict ? args[0].entries() : list(args[0], line).map((p) => list(p, line))) : []); for (const k in kw) d.set(k, kw[k]); return d; }),
    sorted: B("sorted", (args, kw, line) => sortList(list(args[0], line), kw, line)),
    reversed: B("reversed", (args, kw, line) => list(args[0], line).reverse()),
    enumerate: B("enumerate", (args, kw, line) => list(args[0], line).map((x, i) => tuple([i + (args[1] ?? 0), x]))),
    zip: B("zip", (args, kw, line) => { const ls = args.map((a) => list(a, line)); const n = Math.min(...ls.map((l) => l.length)); return Array.from({ length: n }, (_, i) => tuple(ls.map((l) => l[i]))); }),
    any: B("any", (args, kw, line) => list(args[0], line).some(truthy)),
    all: B("all", (args, kw, line) => list(args[0], line).every(truthy)),
    ord: B("ord", (args) => String(args[0]).codePointAt(0)),
    chr: B("chr", (args) => String.fromCodePoint(args[0])),
    isinstance: B("isinstance", (args) => { const t = args[1]; const names = { int: "int", float: "float", str: "str", list: "list", dict: "dict", set: "set", tuple: "tuple", bool: "bool" }; if (t instanceof PyClass) return args[0] instanceof PyObj && args[0].cls === t; const n = Object.keys(names).find((k) => BUILTINS[k] === t); return n ? typeName(args[0]) === n || (n === "float" && typeof args[0] === "number") : false; }),
    input: B("input", (args, kw, line) => { throw new PyError("input() não existe numa apresentação: passe os valores na chamada", line); }),
  };
  const siftUp = (h, i, line) => { while (i > 0) { const p = (i - 1) >> 1; if (!pyLt(h[i], h[p], line)) break; [h[i], h[p]] = [h[p], h[i]]; ev.writes.push([idOf(h), i], [idOf(h), p]); i = p; } };
  const siftDown = (h, i, line) => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && pyLt(h[l], h[m], line)) m = l; if (r < h.length && pyLt(h[r], h[m], line)) m = r; if (m === i) break; [h[i], h[m]] = [h[m], h[i]]; ev.writes.push([idOf(h), i], [idOf(h), m]); i = m; } };
  const MODULES = {
    math: new PyModule("math", { floor: B("floor", (a) => Math.floor(a[0])), ceil: B("ceil", (a) => Math.ceil(a[0])), sqrt: B("sqrt", (a) => Math.sqrt(a[0])), log: B("log", (a) => (a[1] ? Math.log(a[0]) / Math.log(a[1]) : Math.log(a[0]))), log2: B("log2", (a) => Math.log2(a[0])), log10: B("log10", (a) => Math.log10(a[0])), exp: B("exp", (a) => Math.exp(a[0])), sin: B("sin", (a) => Math.sin(a[0])), cos: B("cos", (a) => Math.cos(a[0])), gcd: B("gcd", (a) => { let [x, y] = a.map((n) => Math.abs(n)); while (y) [x, y] = [y, x % y]; return x; }), factorial: B("factorial", (a) => { let r = 1; for (let k = 2; k <= a[0]; k++) r *= k; return r; }), inf: Infinity, pi: Math.PI, e: Math.E }),
    collections: new PyModule("collections", { deque: B("deque", (args, kw, line) => deque(args.length ? list(args[0], line) : [])) }),
    heapq: new PyModule("heapq", {
      heappush: B("heappush", (a, kw, line) => { a[0].push(a[1]); ev.writes.push([idOf(a[0]), a[0].length - 1]); siftUp(a[0], a[0].length - 1, line); return null; }),
      heappop: B("heappop", (a, kw, line) => { const h = a[0]; if (!h.length) throw new PyError("heappop de lista vazia", line); const top = h[0]; const last = h.pop(); if (h.length) { h[0] = last; siftDown(h, 0, line); } return top; }),
      heapify: B("heapify", (a, kw, line) => { for (let i = (a[0].length >> 1) - 1; i >= 0; i--) siftDown(a[0], i, line); return null; }),
    }),
  };
  const lst = (fn) => fn;
  const METHODS = {
    list: {
      append: lst((o, a) => { o.push(a[0]); ev.writes.push([idOf(o), o.length - 1]); return null; }),
      pop: lst((o, a, kw, line) => { if (!o.length) throw new PyError("pop() de lista vazia", line); const i = a.length ? normIndex(o, a[0], line) : o.length - 1; return o.splice(i, 1)[0]; }),
      insert: lst((o, a) => { const i = a[0] < 0 ? Math.max(0, o.length + a[0]) : Math.min(a[0], o.length); o.splice(i, 0, a[1]); ev.writes.push([idOf(o), i]); return null; }),
      remove: lst((o, a, kw, line) => { const i = o.findIndex((x) => pyEq(x, a[0])); if (i < 0) throw new PyError(`${repr(a[0])} não está na lista`, line); o.splice(i, 1); return null; }),
      index: lst((o, a, kw, line) => { const i = o.findIndex((x) => pyEq(x, a[0])); if (i < 0) throw new PyError(`${repr(a[0])} não está na lista`, line); return i; }),
      count: lst((o, a) => o.filter((x) => pyEq(x, a[0])).length),
      extend: lst((o, a, kw, line) => { o.push(...list(a[0], line)); return null; }),
      sort: lst((o, a, kw, line) => { const r = sortList(o, kw, line); o.splice(0, o.length, ...r); return null; }),
      reverse: lst((o) => { o.reverse(); return null; }),
      copy: lst((o) => [...o]),
      clear: lst((o) => { o.length = 0; return null; }),
    },
    tuple: { index: (o, a, kw, line) => METHODS.list.index(o, a, kw, line), count: (o, a) => METHODS.list.count(o, a) },
    deque: {
      append: (o, a) => { o.push(a[0]); ev.writes.push([idOf(o), o.length - 1]); return null; },
      appendleft: (o, a) => { o.unshift(a[0]); ev.writes.push([idOf(o), 0]); return null; },
      pop: (o, a, kw, line) => { if (!o.length) throw new PyError("pop() de deque vazio", line); return o.pop(); },
      popleft: (o, a, kw, line) => { if (!o.length) throw new PyError("popleft() de deque vazio", line); return o.shift(); },
      extend: (o, a, kw, line) => { o.push(...list(a[0], line)); return null; },
      clear: (o) => { o.length = 0; return null; },
    },
    dict: {
      get: (o, a) => { const e = o.get(a[0]); if (e) ev.reads.push([idOf(o), keyOf(a[0])]); return e ? e[1] : a[1] ?? null; },
      keys: (o) => o.keys(), values: (o) => o.values(), items: (o) => o.entries().map((e) => tuple(e)),
      pop: (o, a, kw, line) => { const e = o.get(a[0]); if (!e) { if (a.length > 1) return a[1]; throw new PyError(`a chave ${repr(a[0])} não está no dicionário`, line); } o.delete(a[0]); return e[1]; },
      setdefault: (o, a) => { const e = o.get(a[0]); if (e) return e[1]; o.set(a[0], a[1] ?? null); ev.writes.push([idOf(o), keyOf(a[0])]); return a[1] ?? null; },
      update: (o, a) => { for (const [k, v] of a[0].entries()) o.set(k, v); return null; },
      copy: (o) => new PyDict(o.entries()),
    },
    set: {
      add: (o, a) => { o.add(a[0]); ev.writes.push([idOf(o), keyOf(a[0])]); return null; },
      remove: (o, a, kw, line) => { if (!o.delete(a[0])) throw new PyError(`${repr(a[0])} não está no conjunto`, line); return null; },
      discard: (o, a) => { o.delete(a[0]); return null; },
      pop: (o, a, kw, line) => { const v = o.values()[0]; if (v === undefined) throw new PyError("pop() de conjunto vazio", line); o.delete(v); return v; },
      copy: (o) => new PySet(o.values()),
    },
    str: {
      lower: (o) => o.toLowerCase(), upper: (o) => o.toUpperCase(), strip: (o) => o.trim(),
      split: (o, a) => (a[0] == null ? o.split(/\s+/).filter(Boolean) : o.split(a[0])),
      join: (o, a, kw, line) => list(a[0], line).map((x) => { if (typeof x !== "string") throw new PyError("join() só junta textos", line); return x; }).join(o),
      find: (o, a) => o.indexOf(a[0], a[1] ?? 0), replace: (o, a) => o.split(a[0]).join(a[1]),
      startswith: (o, a) => o.startsWith(a[0]), endswith: (o, a) => o.endsWith(a[0]),
      count: (o, a) => (a[0] ? o.split(a[0]).length - 1 : o.length + 1),
      isdigit: (o) => /^\d+$/.test(o), isalpha: (o) => /^\p{L}+$/u.test(o),
    },
  };

  // último passo: o desenho do passo anterior (a chamada que acabou de devolver) com o resultado
  function finish(text, extra) {
    const last = steps.at(-1);
    if (!last) return step("done", 0, globals, text, { ...extra, done: true });
    steps.push({ ...last, kind: "done", line: 0, text, reads: [], writes: [], matches: [], ...extra, done: true });
  }
  // ---------------- roda
  try {
    execBlock(ast.body, globals);
    if (call) {
      const e = parseExpr(call);
      const v = evalExpr(e, globals);
      finish(`Resultado: ${repr(v)}.`, { ret: repr(v) });
    } else finish("Fim.", {});
  } catch (err) {
    if (err instanceof PyError) { err.steps = steps; throw err; }
    if (err instanceof RangeError) { const e = new PyError("recursão ou dado grande demais"); e.steps = steps; throw e; }
    throw err;
  }
  return { steps, lines: ast.lines, comments: ast.comments, output: out };
}

// valor JS (do YAML) → literal Python, para montar a chamada: {A: [B, C]} → {'A': ['B', 'C']}
export function pyLiteral(v) {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True"; if (v === false) return "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  if (Array.isArray(v)) return `[${v.map(pyLiteral).join(", ")}]`;
  if (typeof v === "object") return `{${Object.entries(v).map(([k, x]) => `${pyLiteral(/^-?\d+(\.\d+)?$/.test(k) ? Number(k) : k)}: ${pyLiteral(x)}`).join(", ")}}`;
  return "None";
}
