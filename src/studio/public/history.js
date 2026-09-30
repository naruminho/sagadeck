// Desfazer / refazer único do Studio: TODA mudança do deck (formulário, arrastar na tela, YAML, IA, transformação,
// revisão, estilo) vira um passo, com um rótulo que diz de onde veio. O histórico é por apresentação (outra abre,
// ele recomeça). Digitação seguida no mesmo campo vira um passo só. Serve ao Studio e aos testes (Node).
(function (root) {
  // onde duas versões diferem (caminhos até as folhas, poucos níveis): digitar no mesmo campo muda sempre o mesmo
  // caminho; arrastar e depois apagar o objeto mudam caminhos diferentes (dx × hidden) e viram dois passos
  function diffPaths(a, b, path = "", out = [], depth = 6) {
    if (out.length > 24) return out;
    if (a === b) return out;
    const oa = a && typeof a === "object", ob = b && typeof b === "object";
    if (!oa || !ob || depth === 0 || Array.isArray(a) !== Array.isArray(b) || (Array.isArray(a) && a.length !== b.length)) { out.push(path); return out; }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diffPaths(a[k], b[k], `${path}/${k}`, out, depth - 1);
    return out;
  }
  function createHistory({ limit = 100, coalesceMs = 1500, now = () => Date.now() } = {}) {
    let undo = [], redo = [], current = null, key = undefined, lastAt = 0, lastLabel = null, lastWhere = null;
    const api = {
      // começa de novo (apresentação aberta)
      reset(deck, file) { undo = []; redo = []; current = deck ? JSON.stringify(deck) : null; key = file; lastLabel = null; },
      // registra o estado atual; outra apresentação recomeça o histórico. Devolve true se virou um passo novo.
      note(deck, label = "Edição", file = key) {
        if (file !== key) { api.reset(deck, file); return false; }
        const json = JSON.stringify(deck);
        if (current === null) { current = json; return false; }
        if (json === current) return false;
        const t = now();
        const where = diffPaths(JSON.parse(current), deck).sort().join("|");
        const merge = label === lastLabel && label === "Edição" && t - lastAt < coalesceMs && where === lastWhere && undo.length;
        if (!merge) { undo.push({ json: current, label }); if (undo.length > limit) undo.shift(); }
        redo = []; current = json; lastAt = t; lastLabel = label; lastWhere = where;
        return !merge;
      },
      // o servidor completou o deck (uid de slide novo, ajuste levado junto): o estado atual é esse, sem passo novo
      rebase(deck) { current = JSON.stringify(deck); },
      undo() {
        if (!undo.length) return null;
        const e = undo.pop();
        redo.push({ json: current, label: e.label });
        current = e.json; lastLabel = null;
        return { deck: JSON.parse(e.json), label: e.label };
      },
      redo() {
        if (!redo.length) return null;
        const e = redo.pop();
        undo.push({ json: current, label: e.label });
        current = e.json; lastLabel = null;
        return { deck: JSON.parse(e.json), label: e.label };
      },
      get canUndo() { return undo.length > 0; },
      get canRedo() { return redo.length > 0; },
      get undoLabel() { return undo.at(-1)?.label || null; },
      get redoLabel() { return redo.at(-1)?.label || null; },
      get size() { return undo.length; },
    };
    return api;
  }
  root.SagaHistory = { createHistory };
})(typeof globalThis !== "undefined" ? globalThis : window);
