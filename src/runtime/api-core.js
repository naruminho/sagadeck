// Núcleo do slide "api" — o mesmo no navegador (runtime) e no Node (montagem e testes):
// caminhos em JSON ($.a.b[0]), variáveis {{nome}}, máscara de segredos e o código gerado
// (curl, Python, Python comentado) a partir da definição do slide. Sem dependências.
(function (g) {
  "use strict";

  // "$.a.b[0]['c d']" -> ["a", "b", 0, "c d"]
  function parsePath(path) {
    const s = String(path || "").trim().replace(/^\$\.?/, "");
    const out = [];
    const re = /\[\s*(\d+)\s*\]|\[\s*(['"])(.*?)\2\s*\]|([^.[\]]+)/g;
    let m;
    while ((m = re.exec(s))) out.push(m[1] != null ? Number(m[1]) : m[3] != null ? m[3] : m[4]);
    return out;
  }
  function get(obj, path) {
    let v = obj;
    for (const k of parsePath(path)) {
      if (v == null || typeof v !== "object") return undefined;
      v = v[k];
    }
    return v;
  }
  function set(obj, path, value) {
    const keys = parsePath(path);
    if (!keys.length) return value;
    let v = obj;
    keys.forEach((k, i) => {
      if (i === keys.length - 1) { v[k] = value; return; }
      if (v[k] == null || typeof v[k] !== "object") v[k] = typeof keys[i + 1] === "number" ? [] : {};
      v = v[k];
    });
    return obj;
  }

  // {{nome}} em qualquer texto do pedido (URL, cabeçalhos, corpo). Sem valor: fica como está.
  const VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;
  function render(value, vars) {
    if (typeof value === "string") return value.replace(VAR, (all, k) => (vars && vars[k] != null ? String(vars[k]) : all));
    if (Array.isArray(value)) return value.map((x) => render(x, vars));
    if (value && typeof value === "object" && value.__py) return value;
    if (value && typeof value === "object") { const o = {}; for (const [k, v] of Object.entries(value)) o[render(k, vars)] = render(v, vars); return o; }
    return value;
  }
  function missing(value, vars) {
    const out = new Set();
    const walk = (v) => {
      if (typeof v === "string") { let m; VAR.lastIndex = 0; while ((m = VAR.exec(v))) if (!vars || vars[m[1]] == null) out.add(m[1]); }
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => { walk(k); walk(x); });
    };
    walk(value);
    return [...out];
  }

  // dev / hom / prod pelo nome (a cor e a confirmação antes de executar em produção dependem disso)
  function envKind(name) {
    const n = String(name || "").toLowerCase();
    if (/^(prod|prd|produc|production)/.test(n)) return "prod";
    if (/^(hom|hml|homolog|stag|qa|uat|teste)/.test(n)) return "hom";
    if (/^(dev|des|local|sandbox)/.test(n)) return "dev";
    return "other";
  }

  // segredo na tela (projetor, gravação do workshop): só o final
  function mask(s) {
    s = String(s || "");
    return s.length <= 8 ? "••••" : "••••" + s.slice(-4);
  }

  // O slide, com os padrões preenchidos. Tudo o que é específico de um serviço vem daqui.
  function normalize(s) {
    s = s || {};
    const req = s.request || {};
    const mode = ["polling", "stream", "sync", "realtime"].includes(s.mode) ? s.mode : "sync";
    const p = s.polling || {};
    return {
      _normalized: true,
      mode,
      request: {
        method: String(req.method || (req.body != null || req.form ? "POST" : "GET")).toUpperCase(),
        url: String(req.url || ""),
        headers: req.headers && typeof req.headers === "object" ? req.headers : {},
        body: req.body,
        form: req.form && typeof req.form === "object" ? req.form : null, // multipart: { campo: "@file" | texto }
        auth: req.auth !== false,
      },
      audio: s.audio ? String(s.audio === true ? "fala.mp3" : s.audio) : null, // TTS: a resposta é áudio (nome do arquivo no código)
      mic: !!s.mic, // STT: gravar do microfone no próprio slide
      token: s.token || null, // este slide gera o token (ex.: Identity): caminho do token na resposta
      file: s.file || null,   // arquivo padrão, ao lado do deck (upload @file ou {{file.base64}})
      polling: mode !== "polling" ? null : {
        id: p.id || "$.id",
        check: { method: String((p.check && p.check.method) || "GET").toUpperCase(), url: String((p.check && p.check.url) || ""), headers: (p.check && p.check.headers) || {}, body: p.check && p.check.body, auth: !(p.check && p.check.auth === false) },
        status: p.status || "$.status",
        done: [].concat(p.done || ["FINISHED", "DONE", "COMPLETED", "SUCCESS"]).map(String),
        failed: [].concat(p.failed || ["ERROR", "FAILED", "FAILURE", "CANCELLED", "CANCELED"]).map(String),
        interval: Number(p.interval) > 0 ? Number(p.interval) : 1,
        timeout: Number(p.timeout) > 0 ? Number(p.timeout) : 120,
      },
      stream: mode !== "stream" ? null : { text: (s.stream && s.stream.text) || "$.choices[0].delta.content" },
      realtime: mode !== "realtime" ? null : realtimeOf(s.realtime || {}, req),
      steps: s.steps || null,
      stepTitle: s.stepTitle || null,
      stepText: s.stepText || null,
      answer: s.answer || null,
      save: s.save && typeof s.save === "object" ? s.save : {},
      tokenVar: s.tokenVar || "API_TOKEN",
      // aba Parâmetros: { "caminho.no.corpo": "o que faz" } — a documentação que falta
      fields: s.fields && typeof s.fields === "object" ? s.fields : null,
      // embeddings: gera o vetor da referência e de cada frase e compara por cosseno
      similarity: s.similarity ? {
        vector: s.similarity.vector || "$.data[0].embedding",
        reference: String(s.similarity.reference || ""),
        texts: [].concat(s.similarity.texts || []).map(String),
      } : null,
      code: [].concat(s.code || ["curl", "python", "python-comentado"]),
      tab: s.tab || "body",
      portal: s.portal || null,
    };
  }

  // Conversa em tempo real (WebSocket): o que mandar ao conectar, como mandar áudio e texto, e como reconhecer
  // o que chega. Os padrões seguem o formato mais comum dessas APIs; qualquer parte pode ser trocada no slide.
  function realtimeOf(r, req) {
    const rc = r.receive || {};
    const one = (v, d) => (v === undefined ? d : v);
    return {
      url: String(r.url || req.url || ""),
      auth: r.auth || "header", // header (Authorization: Bearer) | query:<parâmetro> | none
      open: [].concat(r.open || []),
      audio: {
        rate: Number((r.audio && r.audio.rate) || 24000),
        send: one(r.audio && r.audio.send, { type: "input_audio_buffer.append", audio: "{{audio}}" }),
        commit: [].concat(one(r.audio && r.audio.commit, [{ type: "input_audio_buffer.commit" }, { type: "response.create" }])),
      },
      text: [].concat(one(r.text, [{ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "{{text}}" }] } }, { type: "response.create" }])),
      receive: {
        type: rc.type || "$.type",
        audio: rc.audio || { type: ["response.audio.delta", "response.output_audio.delta"], data: "$.delta" },
        text: rc.text || { type: ["response.audio_transcript.delta", "response.text.delta", "response.output_text.delta", "response.output_audio_transcript.delta"], data: "$.delta" },
        user: rc.user || { type: ["conversation.item.input_audio_transcription.completed"], data: "$.transcript" },
        done: [].concat(rc.done || ["response.done"]),
        error: rc.error || { type: ["error"], data: "$.error.message" },
      },
    };
  }
  // o evento que chegou é deste tipo? (tipo único ou lista)
  const isType = (ev, rule, typePath) => { if (!rule) return false; const t = get(ev, typePath); return [].concat(rule.type || rule).map(String).includes(String(t)); };

  // chave estável de um slide para guardar a última resposta (modo gravado)
  function key(s) {
    if (s && s.id) return String(s.id);
    const a = normalize(s);
    const txt = [s && s.title, a.mode, a.request.method, a.request.url].join("|");
    let h = 5381;
    for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) >>> 0;
    return "api-" + h.toString(36);
  }

  // ---------- código gerado ----------

  const isJsonBody = (b) => b != null && typeof b === "object";
  const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const dq = (s) => JSON.stringify(String(s));

  function pyLiteral(v, ind) {
    ind = ind || "";
    if (v === null || v === undefined) return "None";
    if (v === true) return "True";
    if (v === false) return "False";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return JSON.stringify(v);
    if (v.__py) return v.__py; // expressão Python crua (ex.: CONTEUDO, o arquivo em base64)
    const next = ind + "    ";
    if (Array.isArray(v)) return v.length ? "[\n" + v.map((x) => next + pyLiteral(x, next)).join(",\n") + ",\n" + ind + "]" : "[]";
    const ks = Object.keys(v);
    return ks.length ? "{\n" + ks.map((k) => next + JSON.stringify(k) + ": " + pyLiteral(v[k], next)).join(",\n") + ",\n" + ind + "}" : "{}";
  }
  // "$.a[0].b" -> '["a"][0]["b"]'
  const pyPath = (path) => parsePath(path).map((k) => (typeof k === "number" ? `[${k}]` : `[${JSON.stringify(k)}]`)).join("");

  // Um texto de código com marcas: cada linha pode pertencer a "start", "poll" ou "done",
  // e a apresentação acende essas linhas enquanto a etapa correspondente roda.
  function Lines(explain) {
    const lines = [], marks = {};
    return {
      add(text, tag, why) {
        if (why && explain) String(why).split("\n").forEach((w) => { const m = w.match(/^(\s*)(.*)$/); this.push(m[1] + "# " + m[2], tag, true); });
        String(text).split("\n").forEach((t) => this.push(t, tag));
        return this;
      },
      push(text, tag, comment) {
        lines.push({ text, comment: !!comment });
        if (tag) (marks[tag] = marks[tag] || []).push(lines.length);
        return this;
      },
      blank() { lines.push({ text: "" }); return this; },
      out() { return { code: lines.map((l) => l.text).join("\n"), marks, comments: lines.map((l, i) => (l.comment ? i + 1 : 0)).filter(Boolean) }; },
    };
  }

  function curlCmd(r, tokenVar, extra, fileName) {
    const parts = [`curl -s${extra || ""}${r.method !== "GET" || r.body != null || r.form ? ` -X ${r.method}` : ""} ${dq(r.url)}`];
    if (r.auth) parts.push(`-H "Authorization: Bearer $${tokenVar}"`);
    for (const [k, v] of Object.entries(r.headers || {})) parts.push(`-H ${dq(k + ": " + v)}`);
    if (r.form) for (const [k, v] of Object.entries(r.form)) parts.push(`-F ${dq(k + "=" + (v === "@file" ? "@" + (fileName || "arquivo") : v))}`);
    else if (isJsonBody(r.body)) { parts.push(`-H "Content-Type: application/json"`); parts.push(`-d ${shq(JSON.stringify(r.body, null, 2))}`); }
    else if (r.body != null) parts.push(`-d ${shq(r.body)}`);
    return parts.join(" \\\n  ");
  }

  // {{secret.nome}} no código: $NOME no curl, os.environ["NOME"] no Python (o valor nunca aparece)
  const secretEnv = (k) => String(k).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const MARK = (k) => `@@SECRET:${secretEnv(k)}@@`;
  const secretsIn = (v) => { const out = new Set(); JSON.stringify(v || "").replace(/\{\{\s*secret\.([\w-]+)\s*\}\}/g, (_, k) => out.add(k)); return [...out]; };
  const fileName = (a, vars) => (vars && vars["file.name"]) || (a.file ? String(a.file).split(/[\\/]/).pop() : "arquivo");
  const usesB64 = (a) => JSON.stringify(a.request.body || "").includes("{{file.base64}}");
  function curl(a, vars) {
    const L = Lines(false);
    const name = fileName(a, vars);
    const sec = Object.fromEntries(secretsIn(a.request).map((k) => ["secret." + k, MARK(k)]));
    const req = render(a.request, { ...vars, ...sec, "file.name": name, "file.base64": `<${name} em base64>` });
    if (usesB64(a)) L.add(`# o arquivo vai dentro do JSON, em base64 (gere com: base64 -w0 ${name})`, "start");
    if (a.mode === "polling") {
      const check = render(a.polling.check, { ...vars, id: "$ID" });
      L.add("# 1. inicia", "start").add(curlCmd(req, a.tokenVar, "", name), "start");
      L.add(`# → guarde ${a.polling.id.replace(/^\$\.?/, "")} da resposta em ID`, "start").blank();
      L.add(`# 2. consulta o andamento (repita até ${a.polling.done[0]})`, "poll").add(curlCmd(check, a.tokenVar), "poll");
    } else if (a.mode === "stream") {
      L.add(curlCmd(req, a.tokenVar, "N", name), "start");
    } else {
      L.add(curlCmd(req, a.tokenVar, "", name) + (a.audio ? ` \\\n  --output ${dq(a.audio)}` : ""), "start");
    }
    const o = L.out();
    // dentro de '…' o shell não expande $: fecha a aspa, põe "$NOME" e reabre
    const inSingle = (all, at) => { let n = 0; for (let i = 0; i < at; i++) if (all[i] === "'" && all[i - 1] !== "\\") n++; return n % 2 === 1; };
    o.code = o.code.replace(/@@SECRET:([A-Z0-9_]+)@@/g, (m, k, at, all) => (inSingle(all, at) ? `'"$${k}"'` : `$${k}`));
    return o;
  }

  function pyCall(name, r, extra, ind) {
    ind = ind || "";
    const args = [`${dq(r.url)}`];
    if (r.auth || Object.keys(r.headers || {}).length) args.push("headers=HEADERS");
    if (r.form) {
      const files = Object.entries(r.form).filter(([, v]) => v === "@file"), data = Object.entries(r.form).filter(([, v]) => v !== "@file");
      if (files.length) args.push(`files={${files.map(([k]) => `${JSON.stringify(k)}: open(${dq(r._fileName || "arquivo")}, "rb")`).join(", ")}}`);
      if (data.length) args.push(`data={${data.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(String(v))}`).join(", ")}}`);
    } else if (isJsonBody(r.body)) args.push(`json=${pyLiteral(r.body, ind + "    ")}`);
    else if (r.body != null) args.push(`data=${JSON.stringify(String(r.body))}`);
    args.push(...(extra || []));
    return `${name} = requests.${r.method.toLowerCase()}(\n` + args.map((x) => `${ind}    ${x},`).join("\n") + `\n${ind})`;
  }

  function pyHeaders(L, a, r) {
    const h = {};
    if (r.auth) h.Authorization = "__TOKEN__";
    Object.assign(h, r.headers || {});
    if (!Object.keys(h).length) return;
    const val = (v) => { const m = String(v).match(/^\{\{\s*secret\.([\w-]+)\s*\}\}$/); return m ? `os.environ[${JSON.stringify(String(m[1]).toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}]` : JSON.stringify(String(v)); };
    const body = Object.entries(h).map(([k, v]) => `    ${JSON.stringify(k)}: ${v === "__TOKEN__" ? 'f"Bearer {TOKEN}"' : val(v)},`).join("\n");
    L.add(`HEADERS = {\n${body}\n}`, null, "cabeçalhos enviados em toda chamada");
  }

  function python(a, vars, explain) {
    const L = Lines(explain);
    const name = fileName(a, vars);
    const b64 = usesB64(a);
    const toPy = (v) => (v === "{{file.base64}}" ? { __py: "CONTEUDO" } : typeof v === "string" && /^\{\{\s*secret\.([\w-]+)\s*\}\}$/.test(v) ? { __py: `os.environ[${JSON.stringify(secretEnv(v.match(/secret\.([\w-]+)/)[1]))}]` } : Array.isArray(v) ? v.map(toPy) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPy(x)])) : v);
    const req = { ...render({ ...a.request, body: toPy(a.request.body) }, { ...vars, "file.name": name }), _fileName: name };
    const imports = ["import os"];
    if (b64) imports.push("import base64");
    if (a.mode === "polling") imports.push("import time");
    if (a.mode === "stream") imports.push("import json");
    L.add(imports.join("\n")).blank().add("import requests", null, "requests faz as chamadas HTTP (pip install requests)").blank();
    if (req.auth || (a.polling && a.polling.check.auth)) {
      L.add(`TOKEN = os.environ[${JSON.stringify(a.tokenVar)}]`, null, "o token de acesso vem de uma variável de ambiente, nunca escrito no código").blank();
    }
    pyHeaders(L, a, { ...req, auth: req.auth || !!(a.polling && a.polling.check.auth) });
    L.blank();
    if (b64) L.add(`CONTEUDO = base64.b64encode(open(${dq(name)}, "rb").read()).decode()`, "start", "o arquivo, em base64, vai dentro do JSON").blank();

    if (a.mode === "polling") {
      const check = render(a.polling.check, { ...vars, id: "{execucao}" });
      L.add(pyCall("inicio", req, ["timeout=60"]), "start", "1. inicia: a resposta chega na hora, só com o código da execução");
      L.add("inicio.raise_for_status()", "start", "para aqui se deu erro (4xx/5xx)");
      L.add(`execucao = inicio.json()${pyPath(a.polling.id)}`, "start", "o código que identifica esta execução");
      L.blank();
      const url = check.url.includes("{execucao}") ? `f${dq(check.url)}` : dq(check.url);
      L.add("while True:", "poll", "2. consulta o andamento até terminar (polling)");
      L.add(`    r = requests.${check.method.toLowerCase()}(${url}, ${check.auth || Object.keys(check.headers || {}).length ? "headers=HEADERS, " : ""}timeout=60)`, "poll");
      L.add("    r.raise_for_status()", "poll");
      L.add("    dados = r.json()", "poll");
      L.add(`    status = dados${pyPath(a.polling.status)}`, "poll", "    o status atual da execução");
      L.add("    print(status)", "poll");
      L.add(`    if status in (${a.polling.done.map((x) => JSON.stringify(x)).join(", ")}${a.polling.done.length === 1 ? "," : ""}):`, "poll", "    terminou: sai do laço");
      L.add("        break", "poll");
      L.add(`    if status in (${a.polling.failed.map((x) => JSON.stringify(x)).join(", ")}${a.polling.failed.length === 1 ? "," : ""}):`, "poll", "    deu errado: mostra o motivo");
      L.add('        raise RuntimeError(f"A execução falhou: {dados}")', "poll");
      L.add(`    time.sleep(${a.polling.interval})`, "poll", "    espera um pouco antes de perguntar de novo");
      L.blank();
      if (a.steps) {
        L.add(`for etapa in dados${pyPath(a.steps)}:`, "done", "3. o resultado de cada etapa do workflow");
        L.add(`    print(etapa${a.stepText ? pyPath(a.stepText) : ""})`, "done");
      } else {
        L.add(`print(dados${a.answer ? pyPath(a.answer) : ""})`, "done", "3. o resultado");
      }
    } else if (a.mode === "stream") {
      L.add(pyCall("r", req, ["stream=True", "timeout=300"]).replace(/^r = /, "with ").replace(/\)$/, ") as r:"), "start", "streaming: a resposta chega aos poucos, enquanto é gerada");
      L.add("    r.raise_for_status()", "start");
      L.add("    for linha in r.iter_lines(decode_unicode=True):", "poll", "    cada pedaço chega numa linha \"data: {...}\"");
      L.add('        if not linha or not linha.startswith("data:"):', "poll");
      L.add("            continue", "poll");
      L.add("        dado = linha[5:].strip()", "poll");
      L.add('        if dado == "[DONE]":', "poll", "        o servidor avisa que terminou");
      L.add("            break", "poll");
      L.add(`        pedaco = json.loads(dado)${pyPath(a.stream.text)}`, "poll");
      L.add('        print(pedaco or "", end="", flush=True)', "poll", "        mostra o texto conforme chega");
    } else {
      L.add(pyCall("resposta", req, ["timeout=60"]), "start", "a chamada: espera a resposta completa");
      L.add("resposta.raise_for_status()", "start", "para aqui se deu erro (4xx/5xx)");
      if (a.audio) {
        L.add(`open(${dq(a.audio)}, "wb").write(resposta.content)`, "done", "a resposta é o áudio: salva num arquivo");
        L.add(`print("áudio salvo em", ${dq(a.audio)})`, "done");
        return L.out();
      }
      L.add("dados = resposta.json()", "done");
      if (a.steps) {
        L.add(`for etapa in dados${pyPath(a.steps)}:`, "done", "o resultado de cada etapa");
        L.add(`    print(etapa${a.stepText ? pyPath(a.stepText) : ""})`, "done");
      } else {
        L.add(`print(dados${a.answer ? pyPath(a.answer) : ""})`, "done", a.answer ? "o campo que interessa na resposta" : "a resposta inteira");
      }
    }
    return L.out();
  }

  // similaridade por cosseno: 1 = mesma direção (mesmo sentido), 0 = nada a ver
  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  }

  // código da comparação de frases: uma função embedding(), o cosseno em Python puro e o laço
  function pythonSimilarity(a, vars, explain) {
    const L = Lines(explain);
    const toPy = (v) => (v === "{{text}}" ? { __py: "texto" } : Array.isArray(v) ? v.map(toPy) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPy(x)])) : v);
    const req = render({ ...a.request, body: toPy(a.request.body) }, vars);
    L.add("import math\nimport os").blank().add("import requests", null, "requests faz as chamadas HTTP (pip install requests)").blank();
    if (req.auth) L.add(`TOKEN = os.environ[${JSON.stringify(a.tokenVar)}]`, null, "o token de acesso vem de uma variável de ambiente").blank();
    pyHeaders(L, a, req);
    L.blank();
    L.add("def embedding(texto):", "start", "transforma um texto num vetor de números (o embedding)");
    L.add(pyCall("    r", req, ["timeout=60"], "    ").replace(/^    r = /, "    r = "), "start");
    L.add("    r.raise_for_status()", "start");
    L.add(`    return r.json()${pyPath(a.similarity.vector)}`, "start");
    L.blank();
    L.add("def cosseno(a, b):", null, "similaridade por cosseno: 1 = mesmo sentido, perto de 0 = nada a ver");
    L.add("    produto = sum(x * y for x, y in zip(a, b))");
    L.add("    return produto / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))");
    L.blank();
    L.add(`referencia = embedding(${JSON.stringify(a.similarity.reference)})`, "start", "o vetor da frase de referência");
    L.add(`print(len(referencia), "números")`, "start");
    L.add(`for frase in ${pyLiteral(a.similarity.texts)}:`, "poll", "compara cada frase com a referência");
    L.add('    print(f"{cosseno(referencia, embedding(frase)):.2f}  {frase}")', "poll");
    return L.out();
  }

  function pythonRealtime(a, vars, explain) {
    const L = Lines(explain);
    const R = a.realtime;
    const url = render(R.url, vars);
    L.add("import asyncio\nimport json\nimport os").blank().add("import websockets", null, "conversa em tempo real por WebSocket (pip install websockets)").blank();
    const q = R.auth.startsWith("query:") ? R.auth.slice(6) : null;
    L.add(q ? `URL = f${dq(url + (url.includes("?") ? "&" : "?") + q + "={os.environ['" + a.tokenVar + "']}")}` : `URL = ${dq(url)}`);
    if (R.auth === "header") L.add(`HEADERS = {"Authorization": f"Bearer {os.environ['${a.tokenVar}']}"}`, null, "o token vai no cabeçalho da conexão"); // aspas simples: vale para Python < 3.12
    L.blank();
    const textMsgs = render(R.text, { ...vars, text: "Olá! Em uma frase: o que você faz?" });
    const textTypes = [].concat(R.receive.text.type).map((t) => JSON.stringify(t)).join(", ");
    L.add("async def main():", "start");
    L.add(`    async with websockets.connect(URL${R.auth === "header" ? ", additional_headers=HEADERS" : ""}) as ws:`, "start", "    abre a conexão (fica aberta a conversa toda)");
    for (const m of render(R.open, vars)) L.add(`        await ws.send(json.dumps(${pyLiteral(m, "        ")}))`, "start", "        configuração da sessão, mandada ao conectar");
    textMsgs.forEach((m, i) => L.add(`        await ws.send(json.dumps(${pyLiteral(m, "        ")}))`, "start", i === 0 ? "        manda uma pergunta em texto (no slide, também dá para falar)" : ""));
    L.add("        async for mensagem in ws:", "poll", "        cada evento chega como uma mensagem JSON");
    L.add("            evento = json.loads(mensagem)", "poll");
    L.add(`            if evento${pyPath(R.receive.type)} in (${textTypes}${[].concat(R.receive.text.type).length === 1 ? "," : ""}):`, "poll", "            pedaço do texto da resposta");
    L.add(`                print(evento${pyPath(R.receive.text.data)}, end="", flush=True)`, "poll");
    L.add(`            if evento${pyPath(R.receive.type)} in (${R.receive.done.map((d) => JSON.stringify(d)).join(", ")}${R.receive.done.length === 1 ? "," : ""}):`, "done", "            a resposta terminou");
    L.add("                break", "done");
    L.blank().add("asyncio.run(main())", "start");
    return L.out();
  }
  function wscat(a, vars) {
    const L = Lines(false);
    const R = a.realtime;
    const url = render(R.url, vars);
    const q = R.auth.startsWith("query:") ? R.auth.slice(6) : null;
    L.add("# curl não fala WebSocket; o wscat (npm i -g wscat) abre a conversa no terminal", "start");
    L.add(`wscat -c ${dq(q ? url + (url.includes("?") ? "&" : "?") + q + "=$" + a.tokenVar : url)}${R.auth === "header" ? ` \\\n  -H "Authorization: Bearer $${a.tokenVar}"` : ""}`, "start");
    L.add("# depois de conectar, cole uma mensagem por vez:", "poll");
    for (const m of [...render(R.open, vars), ...render(R.text, { ...vars, text: "Olá!" })]) L.add(JSON.stringify(m), "poll");
    return L.out();
  }

  const LANGS = { curl: "curl", python: "Python", "python-comentado": "Python comentado" };
  function code(slide, lang, vars) {
    const a = slide && slide._normalized ? slide : normalize(slide);
    if (a.realtime) return lang === "curl" ? wscat(a, vars || {}) : pythonRealtime(a, vars || {}, lang === "python-comentado");
    if (a.similarity && lang !== "curl") return pythonSimilarity(a, vars || {}, lang === "python-comentado");
    if (a.similarity && lang === "curl") return curl(a, Object.assign({}, vars, { text: a.similarity.reference }));
    if (lang === "curl") return curl(a, vars || {});
    return python(a, vars || {}, lang === "python-comentado");
  }

  // o slide mexe com arquivo? (upload @file ou {{file.…}})
  const usesFile = (s) => { const a = s && s._normalized ? s : normalize(s); return !!a.file || a.mic || !!(a.request.form && Object.values(a.request.form).includes("@file")) || /\{\{\s*file\./.test(JSON.stringify(a.request)); };
  const api = { isType, cosine, usesFile, parsePath, get, set, render, missing, envKind, mask, normalize, key, code, pyLiteral, pyPath, LANGS };
  g.SagadeckApiCore = api;
})(typeof window !== "undefined" ? window : globalThis);
