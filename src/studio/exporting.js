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

// Gera e envia um arquivo da apresentação. PPTX/PDF/roteiro usam o Chrome invisível (os mesmos
// exportadores de "sagadeck pptx | pdf | roteiro"), numa pasta temporária.
export async function sendExport(res, kind, spec, name, { notes = true, inline = false } = {}) {
  const cd = (file) => `attachment; filename="${slugify(file.replace(/\.\w+$/, ""))}${path.extname(file)}"; filename*=UTF-8''${encodeURIComponent(file)}`;
  if (kind === "sagadeck") {
    const { zip, missing } = await packDeck(spec, { baseDir: spec._dir || process.cwd(), name, generator: "sagadeck studio" });
    res.writeHead(200, { "Content-Type": MIME, "Content-Disposition": cd(name + EXTENSION), "X-Sagadeck-Missing": encodeURIComponent(JSON.stringify(missing)) });
    res.end(zip);
    return;
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `sagadeck-${kind}-`));
  try {
    const r = buildHTML(spec);
    const htmlFile = path.join(tmp, "deck.html");
    fs.writeFileSync(htmlFile, r.html);
    const errors = [];
    const make = async (what) => {
      const out = path.join(tmp, `saida-${what}`);
      if (what === "pptx") {
        const { exportPptx } = await import("../export/pptx.js");
        errors.push(...(await exportPptx(htmlFile, out, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta }, notes })).errors);
      } else if (what === "pdf") {
        const { pdf } = await import("../export/shots.js");
        // Preferências › Exportação: tema escuro com par claro (manual-noite → manual) sai claro no PDF, bom para imprimir
        const light = loadPreferences().exportacao.pdfClaro === true ? lightVariant(spec) : null;
        let file = htmlFile;
        if (light) { file = path.join(tmp, "deck-claro.html"); fs.writeFileSync(file, buildHTML(light).html); }
        await pdf(file, out);
      } else if (what === "estudo" || what === "estudo-html") {
        const { shots } = await import("../export/shots.js");
        const { estudoHTML, estudoPDF } = await import("../export/estudo.js");
        const { files } = await shots(htmlFile, path.join(tmp, "fotos"), { scale: what === "estudo" ? 0.6 : 0.75, jpeg: true });
        const html = estudoHTML({ title: r.meta.title, author: r.meta.author, date: spec.date, slidesMeta: r.slidesMeta, shotFiles: files });
        if (what === "estudo-html") fs.writeFileSync(out, html); else await estudoPDF(html, out);
      } else {
        const { shots } = await import("../export/shots.js");
        const { roteiroPDF } = await import("../export/roteiro.js");
        const { files } = await shots(htmlFile, path.join(tmp, "miniaturas"), { scale: 0.5, jpeg: true });
        await roteiroPDF({ slidesMeta: r.slidesMeta, shotFiles: files, outFile: out, title: r.meta.title, author: r.meta.author, duration: spec.duration });
      }
      return fs.readFileSync(out);
    };
    let body;
    if (kind === "tudo") {
      const zip = new JSZip();
      for (const what of ["pptx", "pdf", "roteiro"]) zip.file(kinds[what].file, await make(what));
      body = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    } else body = await make(kind);
    res.writeHead(200, {
      "Content-Type": k.mime, "Content-Disposition": inline ? "inline" : cd(k.file),
      // só o que afeta o arquivo (falha ao exportar, arquivo não encontrado); o fiscal de conteúdo fica no Revisar
      "X-Sagadeck-Warnings": encodeURIComponent(JSON.stringify([...(r.warnings || []).filter((w) => /não encontrado/.test(w)), ...errors].slice(0, 20))),
    });
    res.end(body);
  } catch (e) {
    console.error(`[Studio] exportação ${kind} falhou:`, e.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
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

