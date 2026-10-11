import { expandApiCollections } from '../api-collections.js';
import { removeRetry } from '../fs-retry.js';
import {meetingSpec} from '../meeting.js';
// Exportar a apresentação aberta ou da biblioteca: .sagadeck, PowerPoint, PDF, roteiro, material de estudo e "Baixar
// tudo". PPTX/PDF/roteiro/estudo usam o Chrome invisível (os mesmos exportadores do CLI), numa pasta temporária.
// (Saiu de server.js: o servidor só decide o que exportar e chama sendExport.)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { buildHTML } from "../build.js";
import { THEMES } from "../themes.js";
import { loadPreferences } from "../preferences.js";
import { packDeck, EXTENSION, MIME } from "../package.js";

const slugify = (s) => String(s || "deck").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "deck";

export function sendHtml(res,spec,audience){
 const out=buildHTML(spec,{audience});res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':'attachment; filename="apresentacao.html"'});res.end(out.html);
}

// Gera e envia um arquivo da apresentação. PPTX/PDF/roteiro usam o Chrome invisível (os mesmos
// exportadores de "sagadeck pptx | pdf | roteiro"), numa pasta temporária.
export async function generateExport(kind, spec, name, { notes = true, audience, macFonts = false, onProgress = () => {} } = {}) {
  spec=meetingSpec(spec,audience);
  onProgress({ phase: 'preparing', completed: 0, total: spec.slides?.length || 0 });
  if (kind === "sagadeck") {
    const { zip, missing } = await packDeck(spec, { baseDir: spec._dir || process.cwd(), name, generator: "sagadeck studio" });
    return { body: zip, file: name + EXTENSION, mime: MIME, missing, warnings: [] };
  }
  const kinds = {
    pptx: { file: `${name}.pptx`, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
    pdf: { file: `${name}.pdf`, mime: "application/pdf" },
    roteiro: { file: `${name} - roteiro.pdf`, mime: "application/pdf" },
    // a visão de estudo do mesmo deck: cada slide inteiro + o texto de consulta (sem as notas do apresentador)
    estudo: { file: `${name} - material de estudo.pdf`, mime: "application/pdf" },
    "estudo-html": { file: `${name} - material de estudo.html`, mime: "text/html; charset=utf-8" },
    // "Baixar tudo": o que se leva para apresentar, num clique (PowerPoint com as notas, PDF e roteiro)
    tudo: { file: `${name}.zip`, mime: "application/zip" },
  };
  const k = kinds[kind];
  if (!k) throw new Error('Formato de exportação inválido.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `sagadeck-${kind}-`));
  try {
    if (["pptx","pdf","tudo"].includes(kind)) spec=expandApiCollections(spec);
    const r = buildHTML(spec);
    const htmlFile = path.join(tmp, "deck.html");
    fs.writeFileSync(htmlFile, r.html);
    const errors = [];
    const make = async (what) => {
      const progress = event => onProgress({ ...event, format: what });
      progress({ phase: 'opening', completed: 0, total: r.slidesMeta.length });
      const out = path.join(tmp, `saida-${what}`);
      if (what === "pptx") {
        const { exportPptx } = await import("../export/pptx.js");
        errors.push(...(await exportPptx(htmlFile, out, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta }, notes, fontFallback: macFonts ? "mac" : undefined, onProgress: progress })).errors);
      } else if (what === "pdf") {
        const { pdf } = await import("../export/shots.js");
        // Preferências › Exportação: tema escuro com par claro (manual-noite → manual) sai claro no PDF, bom para imprimir
        const light = loadPreferences().exportacao.pdfClaro === true ? lightVariant(spec) : null;
        let file = htmlFile;
        if (light) { file = path.join(tmp, "deck-claro.html"); fs.writeFileSync(file, buildHTML(light).html); }
        await pdf(file, out, { onProgress: progress });
      } else if (what === "estudo" || what === "estudo-html") {
        const { shots } = await import("../export/shots.js");
        const { estudoHTML, estudoPDF } = await import("../export/estudo.js");
        const { files } = await shots(htmlFile, path.join(tmp, "fotos"), { scale: what === "estudo" ? 0.6 : 0.75, jpeg: true, onProgress: progress });
        progress({ phase: 'packing', completed: files.length, total: files.length });
        const html = estudoHTML({ title: r.meta.title, author: r.meta.author, date: spec.date, slidesMeta: r.slidesMeta, shotFiles: files });
        if (what === "estudo-html") fs.writeFileSync(out, html); else await estudoPDF(html, out);
      } else {
        const { shots } = await import("../export/shots.js");
        const { roteiroPDF } = await import("../export/roteiro.js");
        const { files } = await shots(htmlFile, path.join(tmp, "miniaturas"), { scale: 0.5, jpeg: true, onProgress: progress });
        progress({ phase: 'packing', completed: files.length, total: files.length });
        await roteiroPDF({ slidesMeta: r.slidesMeta, shotFiles: files, outFile: out, title: r.meta.title, author: r.meta.author, duration: spec.duration });
      }
      return fs.readFileSync(out);
    };
    let body;
    if (kind === "tudo") {
      const zip = new JSZip();
      for (const what of ["pptx", "pdf", "roteiro"]) zip.file(kinds[what].file, await make(what));
      onProgress({ phase: 'packing', format: 'tudo', completed: r.slidesMeta.length, total: r.slidesMeta.length });
      body = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    } else body = await make(kind);
    // só o que afeta o arquivo; o fiscal de conteúdo fica no Revisar
    return { body, file: k.file, mime: k.mime, warnings: [...(r.warnings || []).filter(w => /não encontrado/.test(w)), ...errors].slice(0, 20) };
  } finally {
    removeRetry(tmp);
  }
}

export function exportHeaders(result, inline = false) {
  const cd = file => `attachment; filename="${slugify(file.replace(/\.\w+$/, ''))}${path.extname(file)}"; filename*=UTF-8''${encodeURIComponent(file)}`;
  return { 'Content-Type': result.mime, 'Content-Disposition': inline ? 'inline' : cd(result.file),
    'Cache-Control': 'private, no-store',
    'X-Sagadeck-Warnings': encodeURIComponent(JSON.stringify(result.warnings || [])),
    ...(result.missing ? { 'X-Sagadeck-Missing': encodeURIComponent(JSON.stringify(result.missing)) } : {}) };
}

// Links de compartilhamento e CLI seguem recebendo o arquivo na própria resposta.
export async function sendExport(res, kind, spec, name, options = {}) {
  try {
    const result = await generateExport(kind, spec, name, options);
    res.writeHead(200, exportHeaders(result, options.inline));
    res.end(result.body);
  } catch (e) {
    console.error(`[Studio] exportação ${kind} falhou:`, e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// O mesmo deck no tema claro do par (deck e slides com tema escuro que tem par claro); null se não há o que trocar
export function lightVariant(spec) {
  const swap = (name) => (THEMES[name]?.dark && THEMES[name].pair ? THEMES[name].pair : null);
  const deckTo = swap(spec.theme);
  const slides = (spec.slides || []).map((s) => (s.theme && swap(s.theme) ? { ...s, theme: swap(s.theme) } : s));
  if (!deckTo && slides.every((s, i) => s === spec.slides[i])) return null;
  return { ...spec, theme: deckTo || spec.theme, slides };
}
