// Colar código e cURL no Studio. O importador lê argumentos; nunca abre um shell ou executa o pedido.
(function (root) {
  "use strict";
  const languages = ["Python", "Java", "JavaScript", "TypeScript", "C#", "Bash", "JSON", "SQL"];
  const aliases = { python: "Python", py: "Python", java: "Java", javascript: "JavaScript", js: "JavaScript", node: "JavaScript", nodejs: "JavaScript", typescript: "TypeScript", ts: "TypeScript", "c#": "C#", csharp: "C#", cs: "C#", bash: "Bash", shell: "Bash", sh: "Bash", curl: "Bash", json: "JSON", jsonc: "JSON", sql: "SQL" };
  function normalizeLanguage(value) { return aliases[String(value || "").trim().toLowerCase().replace(/[\s._-]/g, "")] || ""; }
  function inferLanguage(filename, code = "") {
    const file = String(filename || "").trim().split(/[\\/]/).pop() || "";
    const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
    const found = { ".py": "Python", ".pyw": "Python", ".java": "Java", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript", ".cs": "C#", ".sh": "Bash", ".bash": "Bash", ".json": "JSON", ".jsonc": "JSON", ".sql": "SQL" }[ext];
    if (found) return found;
    const text = String(code).trim();
    if (/^curl(?:\.exe)?\s/i.test(text) || /^#!.*\b(?:bash|sh)\b/.test(text)) return "Bash";
    if (/^[\[{]/.test(text)) { try { JSON.parse(text); return "JSON"; } catch {} }
    if (/^(?:SELECT|WITH|INSERT\s+INTO|CREATE\s+TABLE|UPDATE|DELETE\s+FROM)\b/i.test(text)) return "SQL";
    if (/\b(?:def\s+\w+\(|from\s+\w+\s+import|print\s*\(|import\s+[\w.]+\s*$)/m.test(text)) return "Python";
    if (/\b(?:interface\s+\w+|type\s+\w+\s*=|const\s+\w+\s*:\s*\w+)/.test(text)) return "TypeScript";
    if (/\b(?:using\s+System|namespace\s+\w+|Console\.Write)/.test(text)) return "C#";
    if (/\b(?:public\s+class|System\.out\.|import\s+java\.)/.test(text)) return "Java";
    if (/\b(?:const|let|function)\s+\w+|console\.log|=>/.test(text)) return "JavaScript";
    return "";
  }
  function selectionLines(code, start = 0, end = start) {
    const text = String(code), from = Math.max(0, Math.min(text.length, start)), to = Math.max(from, Math.min(text.length, end));
    const first = text.slice(0, from).split("\n").length;
    const last = text.slice(0, to > from && text[to - 1] === "\n" ? to - 1 : to).split("\n").length;
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  }
  function curlTokens(source) {
    const text = String(source).replace(/\r\n?/g, "\n"), out = [];
    let word = "", quote = "", active = false;
    const push = () => { if (active) out.push(word); word = ""; active = false; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (quote === "'") { if (c === quote) quote = ""; else word += c; continue; }
      if ((c === "\\" || (!quote && (c === "^" || c === "`"))) && next === "\n") { i++; continue; }
      if (c === "`" || (c === "$" && next === "(")) throw new Error("Substituição de comandos não é importada. Cole o cURL com os valores ou variáveis {{nome}}.");
      if (quote === '"') {
        if (c === quote) { quote = ""; continue; }
        if (c === "\\" && /["\\$`]/.test(next || "")) { word += next; i++; } else word += c;
        continue;
      }
      if (/\s/.test(c)) { push(); continue; }
      if (c === "'" || c === '"') { quote = c; active = true; continue; }
      if (/[;&|<>]/.test(c)) throw new Error("Cole uma única chamada cURL. Operadores de shell precisam ficar entre aspas quando fazem parte da URL ou do corpo.");
      if (c === "\\" && next != null) { word += next; active = true; i++; continue; }
      word += c; active = true;
    }
    if (quote) throw new Error("Falta fechar uma aspa no cURL colado.");
    push();
    return out;
  }
  const sensitive = /^(?:authorization|proxy-authorization|cookie|set-cookie|(?:x[-_])?(?:api[-_]?key|auth[-_]?token|access[-_]?token|token)|password|passwd|senha|secret|client[-_]?secret|refresh[-_]?token|id[-_]?token|signature)$/i;
  const safeValue = value => /\{\{[^{}]+\}\}/.test(String(value)) && !String(value).replace(/\{\{[^{}]+\}\}/g, "").replace(/^(?:Bearer|Basic)\s*/i, "").trim();
  // O texto do JSON é a fonte: só os spans dos segredos mudam. Recriar o objeto perderia precisão
  // de inteiros grandes, espaços, notação numérica e até chaves repetidas.
  function protectJson(text, protect) {
    JSON.parse(text); // valida a gramática; o objeto e seus números nunca são usados para reescrever.
    let cursor = 0; const edits = [];
    const space = () => { while (/\s/.test(text[cursor] || "") && cursor < text.length) cursor++; };
    const string = () => { const from = cursor++; while (cursor < text.length) { if (text[cursor] === "\\") cursor += 2; else if (text[cursor++] === '"') break; } return [from, cursor]; };
    const value = (path, key, depth = 0) => {
      if (depth > 256) throw new Error("O JSON tem mais de 256 níveis. Simplifique o corpo antes de importar.");
      space(); const from = cursor;
      if (text[cursor] === "{") {
        cursor++; space();
        while (text[cursor] !== "}") {
          const [a, b] = string(), child = JSON.parse(text.slice(a, b)); space(); cursor++; space();
          value(key == null ? path : `${path}_${key}`, child, depth + 1); space();
          if (text[cursor] !== ",") break; cursor++; space();
        }
        cursor++;
      } else if (text[cursor] === "[") {
        cursor++; space(); let index = 0;
        while (text[cursor] !== "]") {
          value(key == null ? path : `${path}_${key}`, String(index++), depth + 1); space();
          if (text[cursor] !== ",") break; cursor++; space();
        }
        cursor++;
      } else {
        const quoted = text[cursor] === '"';
        if (quoted) string(); else while (cursor < text.length && !/[\s,}\]]/.test(text[cursor])) cursor++;
        const raw = text.slice(from, cursor);
        if (key != null && sensitive.test(key) && raw !== "null") {
          const current = quoted ? JSON.parse(raw) : raw, replacement = protect(key, current, path);
          if (replacement !== current) edits.push({ from, to: cursor, text: JSON.stringify(replacement) });
        }
      }
    };
    value("corpo", null);
    let result = "", last = 0;
    for (const edit of edits) { result += text.slice(last, edit.from) + edit.text; last = edit.to; }
    return result + text.slice(last);
  }
  function protectRequest(request) {
    const secrets = [], names = new Set();
    const protect = (key, value, location, preferred) => {
      if (!String(value).trim() || safeValue(value)) return value;
      let name = preferred || `${location}_${key}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const base = name; let suffix = 2;
      while (names.has(name)) name = `${base}_${suffix++}`;
      names.add(name); secrets.push({ name, location, field: key });
      return `{{secret.${name}}}`;
    };
    for (const [key, value] of Object.entries(request.headers)) {
      if (!sensitive.test(key)) continue;
      if (/^authorization$/i.test(key) && /^Bearer\s+/i.test(value)) {
        request.headers[key] = `Bearer ${protect(key, value.replace(/^Bearer\s+/i, ""), "cabecalho", "token")}`;
      } else request.headers[key] = protect(key, value, "cabecalho");
    }
    // Preserva a URL original (ordem, encoding e fragmento); troca somente valores sensíveis.
    request.url = request.url.replace(/([?&])([^=&?#]+)=([^&#]*)/g, (all, sep, key, value) => {
      let decoded; try { decoded = decodeURIComponent(key); } catch { return all; }
      return sensitive.test(decoded) ? `${sep}${key}=${protect(decoded, value, "url")}` : all;
    });
    if (request.body != null) {
      const original = request.body;
      let isJson = false;
      if (/^\s*[\[{]/.test(original)) { try { JSON.parse(original); isJson = true; } catch {} }
      if (isJson) request.body = protectJson(original, protect);
      else if (/^[^=\s&]+=[\s\S]*$/.test(original)) {
        request.body = original.replace(/(^|&)([^=&]+)=([^&]*)/g, (all, sep, key, value) => {
          let decoded; try { decoded = decodeURIComponent(key); } catch { return all; }
          return sensitive.test(decoded) ? `${sep}${key}=${protect(decoded, value, "corpo")}` : all;
        });
      }
    }
    return secrets;
  }
  function parseCurl(source) {
    const args = curlTokens(source);
    if (!/^curl(?:\.exe)?$/i.test(args.shift() || "")) throw new Error("Para uma API executável, cole uma chamada começando com curl. Para outro código, escolha Código no slide.");
    const request = { method: "GET", url: "", headers: {}, auth: false };
    const data = []; let explicitMethod = "", get = false, json = false;
    const values = new Set(["-X", "--request", "-H", "--header", "-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--json", "--url"]);
    const ignored = new Set(["-s", "-S", "-sS", "-Ss", "--silent", "--show-error", "-i", "--include", "-v", "--verbose", "--compressed"]);
    for (let i = 0; i < args.length; i++) {
      let flag = args[i], value;
      const equal = flag.match(/^(--[^=]+)=([\s\S]*)$/), attached = flag.match(/^(-[XHd])([\s\S]+)$/);
      if (equal || attached) { flag = (equal || attached)[1]; value = (equal || attached)[2]; }
      if (values.has(flag)) {
        value ??= args[++i];
        if (value == null) throw new Error(`Falta o valor de ${flag}.`);
        if (["-X", "--request"].includes(flag)) {
          explicitMethod = value.toUpperCase();
          if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(explicitMethod)) throw new Error("Use um método HTTP: GET, POST, PUT, PATCH, DELETE, HEAD ou OPTIONS.");
        } else if (["-H", "--header"].includes(flag)) {
          const at = value.indexOf(":");
          if (at < 1) throw new Error("Cabeçalho sem nome e valor. Use -H 'Nome: valor'.");
          const key = value.slice(0, at).trim(), existing = Object.keys(request.headers).find(k => k.toLowerCase() === key.toLowerCase());
          if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || /[\r\n]/.test(value)) throw new Error("Cabeçalho HTTP inválido.");
          if (existing) throw new Error(`O cabeçalho ${key} aparece duas vezes. Una os valores antes de importar.`);
          request.headers[key] = value.slice(at + 1).trim();
        } else if (flag === "--url") {
          if (request.url) throw new Error("Importe uma URL por slide."); request.url = value;
        } else {
          if (flag !== "--data-raw" && (/^@/.test(value) || (flag === "--data-urlencode" && /^[^=]*@/.test(value)))) throw new Error("Corpo vindo de arquivo não é importado. Cole o conteúdo do arquivo no cURL.");
          if (flag === "--data-urlencode") {
            const at = value.indexOf("=");
            const encode = raw => raw.split(/(\{\{[^{}]+\}\})/g).map(part => /^\{\{/.test(part) ? part : encodeURIComponent(part)).join("");
            value = at < 0 ? encode(value) : (at ? value.slice(0, at) + "=" : "") + encode(value.slice(at + 1));
          }
          if (flag === "--json") json = true;
          data.push(value);
        }
      } else if (flag === "-G" || flag === "--get") get = true;
      else if (flag === "-I" || flag === "--head") explicitMethod = "HEAD";
      else if (ignored.has(flag)) {}
      else if (flag.startsWith("-")) throw new Error(`A opção ${flag} ainda não é importada. Remova-a ou use Código no slide para exibir o cURL completo.`);
      else { if (request.url) throw new Error("Importe uma URL por slide."); request.url = flag; }
    }
    if (!/^https?:\/\/|^\{\{[^{}]+\}\}/i.test(request.url)) throw new Error("Informe uma URL HTTP/HTTPS, ou {{base}} com o caminho do endpoint.");
    if (/^https?:\/\/[^/?#]*@/i.test(request.url)) throw new Error("A URL contém usuário ou senha. Use autenticação nos Ambientes e retire as credenciais da URL.");
    if (/[\r\n]/.test(request.url)) throw new Error("A URL não pode conter quebras de linha.");
    const payload = data.join("&");
    if (get && data.length) {
      const [url, ...hash] = request.url.split("#");
      request.url = url + (url.includes("?") ? "&" : "?") + payload + (hash.length ? "#" + hash.join("#") : "");
    } else if (data.length) request.body = payload;
    request.method = explicitMethod || (get ? "GET" : data.length ? "POST" : "GET");
    const hasHeader = name => Object.keys(request.headers).some(k => k.toLowerCase() === name);
    if (json) { if (!hasHeader("content-type")) request.headers["Content-Type"] = "application/json"; if (!hasHeader("accept")) request.headers.Accept = "application/json"; }
    else if (data.length && !get && !hasHeader("content-type")) request.headers["Content-Type"] = "application/x-www-form-urlencoded";
    request.urlEncoding = "query";
    if (request.body != null) {
      const contentType = Object.entries(request.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "";
      if (/json/i.test(contentType)) request.bodyEncoding = "json";
      else if (/application\/x-www-form-urlencoded/i.test(contentType)) request.bodyEncoding = "urlencoded";
    }
    const secrets = protectRequest(request);
    return { request, secrets };
  }
  function makeSlide({ source, mode = "code", title = "", filename = "", language = "", steps = [] }) {
    if (!String(source || "").trim()) throw new Error("Cole o código ou cURL antes de inserir o slide.");
    if (mode === "api") {
      const parsed = parseCurl(source);
      return { slide: { layout: "api", title: title.trim() || `${parsed.request.method} · Minha API`, request: parsed.request, code: ["curl", "javascript", "python"], tab: "curl" }, secrets: parsed.secrets };
    }
    const slide = { layout: mode === "codewalk" ? "codewalk" : "code", title: title.trim() || "Meu código", code: String(source) };
    if (filename.trim()) slide.filename = filename.trim();
    const chosen = language || inferLanguage(filename, source); if (chosen) slide.language = chosen;
    if (mode === "codewalk") slide.steps = steps.length ? JSON.parse(JSON.stringify(steps)) : [{ title: "Comece por aqui", text: "", highlight: [1] }];
    return { slide, secrets: [] };
  }
  function addSelectionStep(slide, button, ctx) {
    const field = [...button.closest("#slide-fields-form").querySelectorAll(".sf-field")].find(x => x.querySelector(".sf-label")?.textContent === "Código");
    const input = field?.querySelector("textarea"); if (!input || !input.value.trim()) return;
    const highlight = selectionLines(input.value, input.selectionStart, input.selectionEnd);
    slide.steps = [...(slide.steps || []), { title: highlight.length === 1 ? `Linha ${highlight[0]}` : `Linhas ${highlight[0]} a ${highlight.at(-1)}`, text: "", highlight }];
    ctx.commit(true);
  }
  function open() {
    if (document.querySelector(".dev-author-dialog")) return Promise.resolve(null);
    return new Promise(resolve => {
      const previous = document.activeElement, dialog = document.createElement("dialog");
      dialog.className = "dev-author-dialog"; dialog.setAttribute("aria-labelledby", "dev-author-title");
      dialog.innerHTML = `<header><div><small>CÓDIGO E API</small><h2 id="dev-author-title">Cole. Escolha. Apresente.</h2><p>Seu código continua exatamente como você escreveu.</p></div><button type="button" data-close aria-label="Fechar"><i class="ic" data-ic="x"></i></button></header>
        <div class="dev-author-work"><section class="dev-author-source"><label for="dev-source">Código ou cURL</label><textarea id="dev-source" spellcheck="false" placeholder="Cole um código ou uma chamada curl..."></textarea><div class="dev-author-meta"><label>Título do slide<input data-title placeholder="O que você vai mostrar?"></label><label>Nome do arquivo <small>(opcional)</small><input data-filename placeholder="exemplo.py"></label><label>Linguagem<select data-language><option value="">Detectar automaticamente</option>${languages.map(x => `<option>${x}</option>`).join("")}</select></label></div><p data-detected class="dev-author-tip" role="status">A linguagem aparece assim que você colar o código.</p></section>
        <aside><fieldset class="dev-author-modes"><legend>Como apresentar?</legend><label><input type="radio" name="dev-mode" value="code" checked><span><b>Código no slide</b><small>Realce de sintaxe, sem executar.</small></span></label><label><input type="radio" name="dev-mode" value="codewalk"><span><b>Explicação guiada</b><small>Um destaque por clique, com sua explicação.</small></span></label><label><input type="radio" name="dev-mode" value="api"><span><b>API executável</b><small>Transforma cURL em pedido, resposta e código.</small></span></label></fieldset>
        <section data-guide hidden><h3>Marque as linhas da explicação</h3><p class="dev-author-tip">Selecione um trecho do código ou informe as linhas.</p><div class="dev-author-range"><label>De<input data-from type="number" min="1" value="1"></label><label>Até<input data-to type="number" min="1" value="1"></label></div><label>Título da etapa<input data-step-title placeholder="Ex.: Preparar o pedido"></label><label>Explicação<textarea data-step-text rows="2" placeholder="O que essas linhas fazem?"></textarea></label><label>Saída esperada <small>(opcional, simulação)</small><textarea data-step-output rows="2" placeholder="Ex.: 6"></textarea></label><button type="button" data-add-step>Adicionar etapa</button><div data-step-list class="dev-author-steps"></div></section>
        <section data-api hidden><h3>Prévia do pedido</h3><pre data-request></pre><p class="dev-author-tip">Inserir o slide não faz a chamada. A API só executa quando você clicar em Executar.</p><div data-secrets class="dev-author-secrets" hidden></div></section></aside></div>
        <footer><span data-status role="status"></span><button type="button" data-cancel>Cancelar</button><button type="button" data-insert class="dev-author-primary">Inserir slide</button></footer>`;
      document.body.append(dialog);
      dialog.querySelectorAll(".ic[data-ic]").forEach(el => { const icon = root.UI_ICONS?.[el.dataset.ic]; if (icon) el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`; });
      const $ = s => dialog.querySelector(s), source = $("#dev-source"), steps = [];
      let manualMode = false, parsingError = "", selected = -1;
      const mode = () => $('input[name="dev-mode"]:checked').value;
      const finish = value => { source.value = ""; dialog.close(); dialog.remove(); previous?.focus(); resolve(value); };
      $("[data-close]").onclick = $("[data-cancel]").onclick = () => finish(null);
      dialog.addEventListener("cancel", e => { e.preventDefault(); finish(null); });
      dialog.addEventListener("keydown", e => e.stopPropagation());
      function showSteps() {
        $("[data-step-list]").replaceChildren(...steps.map((step, i) => {
          const row = document.createElement("div"), edit = document.createElement("button"), remove = document.createElement("button");
          row.className = "dev-author-step"; edit.type = remove.type = "button";
          edit.textContent = `${i + 1}. ${step.title} (linhas ${step.highlight[0]} a ${step.highlight.at(-1)})`; edit.classList.toggle("active", selected === i);
          edit.onclick = () => { selected = i; $("[data-from]").value = step.highlight[0]; $("[data-to]").value = step.highlight.at(-1); $("[data-step-title]").value = step.title; $("[data-step-text]").value = step.text; $("[data-step-output]").value = step.output || ""; showSteps(); };
          remove.textContent = "Remover"; remove.setAttribute("aria-label", `Remover etapa ${i + 1}`); remove.onclick = () => { steps.splice(i, 1); selected = -1; showSteps(); };
          row.append(edit, remove); return row;
        }));
      }
      function readStep() {
        const max = source.value.split("\n").length, from = Number($("[data-from]").value), to = Number($("[data-to]").value);
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > max) throw new Error(`Escolha linhas entre 1 e ${max}, com o fim depois do início.`);
        const step = { title: $("[data-step-title]").value.trim() || (from === to ? `Linha ${from}` : `Linhas ${from} a ${to}`), text: $("[data-step-text]").value, highlight: Array.from({ length: to - from + 1 }, (_, i) => from + i) };
        if ($("[data-step-output]").value) step.output = $("[data-step-output]").value;
        return step;
      }
      $("[data-add-step]").onclick = () => { try { steps.push(readStep()); selected = -1; showSteps(); $("[data-status]").textContent = "Etapa adicionada. Selecione outro trecho para continuar."; } catch (e) { $("[data-status]").textContent = e.message; } };
      ["from", "to", "step-title", "step-text", "step-output"].forEach(key => $(`[data-${key}]`).addEventListener("input", () => {
        if (selected < 0) return; try { steps[selected] = readStep(); showSteps(); $("[data-status]").textContent = ""; } catch (e) { $("[data-status]").textContent = e.message; }
      }));
      const selectLines = () => {
        const lines = selectionLines(source.value, source.selectionStart, source.selectionEnd);
        if (source.selectionStart === source.selectionEnd) return;
        selected = -1; $("[data-from]").value = lines[0]; $("[data-to]").value = lines.at(-1); showSteps();
      };
      source.addEventListener("select", selectLines); source.addEventListener("keyup", selectLines);
      function update() {
        const language = $("[data-language]").value || inferLanguage($("[data-filename]").value, source.value);
        $("[data-detected]").textContent = language ? `Linguagem: ${language}. Você pode trocar acima.` : "Escolha uma linguagem para realçar a sintaxe.";
        if (!manualMode) { const detectedCurl = /^\s*curl(?:\.exe)?\s/i.test(source.value); $(`input[value="${detectedCurl ? "api" : "code"}"]`).checked = true; }
        $("[data-guide]").hidden = mode() !== "codewalk"; $("[data-api]").hidden = mode() !== "api";
        parsingError = ""; $("[data-status]").textContent = "";
        if (mode() === "api" && source.value.trim()) {
          try {
            const parsed = parseCurl(source.value);
            $("[data-request]").textContent = `${parsed.request.method} ${parsed.request.url}\n\n${Object.entries(parsed.request.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}${parsed.request.body == null ? "" : "\n\n" + parsed.request.body}`;
            $("[data-secrets]").hidden = !parsed.secrets.length;
            $("[data-secrets]").textContent = parsed.secrets.length ? `Credenciais substituídas: ${parsed.secrets.map(x => `{{secret.${x.name}}}`).join(", ")}. Cadastre esses nomes em Inserir > Ambientes > Segredos antes de executar, com o valor original, sem URL encode ou escape JSON. Os valores colados não serão salvos no deck.` : "";
          } catch (e) { parsingError = e.message; $("[data-request]").textContent = ""; $("[data-secrets]").hidden = true; $("[data-status]").textContent = e.message; }
        }
        $("[data-insert]").disabled = !source.value.trim() || !!parsingError;
      }
      source.oninput = update; $("[data-filename]").oninput = update; $("[data-language]").onchange = update;
      dialog.querySelectorAll('[name="dev-mode"]').forEach(input => input.onchange = () => { manualMode = true; update(); });
      $("[data-insert]").onclick = () => {
        try {
          if (mode() === "codewalk") {
            if (selected >= 0) steps[selected] = readStep();
            if (!steps.length) steps.push(readStep());
            if (steps.some(step => step.highlight.some(line => line > source.value.split("\n").length))) throw new Error("O código mudou. Ajuste as linhas das etapas antes de inserir.");
          }
          const result = makeSlide({ source: source.value, mode: mode(), title: $("[data-title]").value, filename: $("[data-filename]").value, language: $("[data-language]").value, steps });
          finish(result);
        } catch (e) { $("[data-status]").textContent = e.message; }
      };
      dialog.showModal(); source.focus(); update();
    });
  }
  function bind(ctx) {
    document.querySelectorAll("[data-developer-open]").forEach(button => button.onclick = async () => {
      if (!ctx.state.deck) return;
      const deck = ctx.state.deck, at = ctx.state.currentSlideIndex + 1, result = await open();
      if (!result || ctx.state.deck !== deck) return;
      deck.slides.splice(Math.min(at, deck.slides.length), 0, result.slide);
      ctx.state.currentSlideIndex = Math.min(at, deck.slides.length - 1); ctx.state.selectedSlides = [ctx.state.currentSlideIndex]; ctx.state.editorStep = "all";
      try {
        await ctx.syncDeckToServer({ throwOnError: true });
        ctx.renderThumbnails(); await ctx.renderCurrentSlide(); ctx.openPane("props");
        ctx.showToast(result.secrets.length ? "Slide inserido com credenciais protegidas. Configure os segredos em Inserir > Ambientes." : "Slide inserido. Ajuste o conteúdo no painel Formatar.");
      } catch (e) { ctx.showToast(e.message); ctx.renderThumbnails(); await ctx.renderCurrentSlide(); }
    });
  }
  root.SagaDeveloperAuthoring = { languages, normalizeLanguage, inferLanguage, selectionLines, parseCurl, makeSlide, addSelectionStep, open, bind };
})(globalThis);
