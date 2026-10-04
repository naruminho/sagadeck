import path from "node:path";
import fs from "node:fs";
import { loadSpec } from "../build.js";
export function scopePreviewHTML(html, req) {
  const tab = String(req.headers['x-sagadeck-workspace'] || new URL(req.url, 'http://localhost').searchParams.get('_workspace') || '').slice(0, 100);
  if (!tab) return html;
  const value = JSON.stringify(tab).replace(/</g, '\\u003c');
  return html.replace(/<head>/i, `<head><script>(function(){const id=${value},original=window.fetch.bind(window);window.fetch=(input,options)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);if(u.origin!==location.origin)return original(input,options);const headers=new Headers(options?.headers||input?.headers);headers.set('x-sagadeck-workspace',id);return original(input,{...options,headers})}})();</script>`);
}
export function workspaceResolver({ opts, USER_HEADER, workspaces, newWorkspace }) {
  function freshWorkspace(W) {
    if (W.file && fs.existsSync(W.file)) {
      const stat = fs.statSync(W.file); if (!stat.isFile()) return W;
      const stamp = W.file+'|'+stat.mtimeMs+'|'+stat.size;
      if (W.diskStamp !== stamp) { W.spec = loadSpec(W.file); W.diskStamp = stamp; }
    }
    return W;
  }
  function workspaceOf(req) {
    const user = opts.multiuser ? String(req.headers[USER_HEADER] || "").trim() : "";
    if (opts.multiuser && !user) return null;
    if (!workspaces.has(user)) workspaces.set(user, newWorkspace(user));
    const base = workspaces.get(user);
    const tab = String(req.headers['x-sagadeck-workspace'] || new URL(req.url, 'http://localhost').searchParams.get('_workspace') || '').slice(0, 100);
    if (!tab) return freshWorkspace(base);
    const key = JSON.stringify([user, tab]);
    if (!workspaces.has(key)) workspaces.set(key, { ...base, spec: structuredClone(base.spec), aiChats: new Map(), contextDocs: new Map() });
    return freshWorkspace(workspaces.get(key));
  }
  return workspaceOf;
}

  const sameFile = (a, b) => { const n = (x) => path.resolve(String(x)); return process.platform === "win32" ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b); };
  export function staleTab(body, W, res) {
    if (!body?.expectFile || !W.file || sameFile(body.expectFile, W.file)) return false;
    res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Outra aba ou aparelho abriu outra apresentação neste Studio. Recarregue a página para continuar; esta mudança não foi gravada.", stale: true, file: W.file }));
    return true;
  }
