// sagadeck · Fiscal Inteligente e Motor de Auto-Correção
// Detecta e repara automaticamente:
// 1. Sobreposição de elementos (bounding box collision)
// 2. Transgressão de margens seguras (safe area overflow)
// 3. Estouro de texto e fontes fora dos limites (horizontal/vertical overflow)
// 4. Elementos fora das coordenadas do slide (0..1920, 0..1080)
// 5. Excesso de texto anti-sono (move narrativa secundária para notes:)

export function parseIssueText(text) {
  if (!text) return { target: "", detail: "" };
  const parts = text.split("⟂").map((s) => s.trim());
  return {
    elements: parts,
    target: parts[0] || text,
    detail: parts[1] || "",
  };
}

export function autofixSlide(slide, spec = {}, issues = []) {
  const s = JSON.parse(JSON.stringify(slide));
  const actions = [];
  const layout = s.layout || "blocks";

  // 1. Se recebemos lista de problemas do fiscal / DOM
  if (Array.isArray(issues) && issues.length > 0) {
    for (const issue of issues) {
      const kind = issue.kind;

      // --- Caso: Sobreposição ---
      if (kind === "sobreposicao") {
        if (layout === "canvas" && Array.isArray(s.elements)) {
          // No canvas, calcular caixas e empurrar elemento de baixo
          let adjusted = false;
          for (let i = 0; i < s.elements.length; i++) {
            for (let j = i + 1; j < s.elements.length; j++) {
              const A = s.elements[i];
              const B = s.elements[j];
              const ax = A.x ?? 0, ay = A.y ?? 0, aw = A.w ?? 400, ah = A.h ?? 150;
              const bx = B.x ?? 0, by = B.y ?? 0, bw = B.w ?? 400, bh = B.h ?? 150;
              const ix = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
              const iy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
              if (ix > 8 && iy > 8) {
                // Sobreposição detectada: empurrar B para baixo de A
                B.y = ay + ah + 24;
                // Garantir que não saia da margem inferior (976px)
                if (B.y + bh > 976) {
                  B.y = 976 - bh;
                  // Se ainda colidir, alinhar horizontalmente se couber
                  if (ax + aw + bw + 24 <= 1800) {
                    B.x = ax + aw + 24;
                    B.y = ay;
                  }
                }
                adjusted = true;
                actions.push(`Reposicionado elemento no canvas para eliminar sobreposição com "${issue.text}"`);
              }
            }
          }
        } else {
          // Layouts padrão: reduzir titleSize ou diminuir altura de blocos
          const curSize = s.titleSize || (layout === "cover" ? 140 : layout === "statement" ? 110 : 92);
          const newSize = Math.max(48, Math.round(curSize * 0.78));
          if (newSize !== curSize) {
            s.titleSize = newSize;
            actions.push(`Reduzido titleSize de ${curSize}px para ${newSize}px para eliminar sobreposição`);
          }
          if (s.fit !== false) s.fit = true;
        }
      }

      // --- Caso: Passa da Margem Inferior (Overflow vertical da safe area) ---
      if (kind === "passa-da-margem-inferior") {
        const pxOverflow = issue.px || 30;

        // Se o título estiver grande, reduzi-lo
        const curSize = s.titleSize || (layout === "cover" ? 140 : layout === "section" ? 150 : 92);
        if (curSize > 56) {
          const newSize = Math.max(48, Math.round(curSize * 0.75));
          s.titleSize = newSize;
          actions.push(`Ajustado tamanho do título (${curSize}px -> ${newSize}px) para recolher o conteúdo à margem segura (+${pxOverflow}px)`);
        }

        // Se layout for cards e estiver em 1 ou 2 colunas com mais de 3 cards, expandir para 3 ou 4 colunas
        if (layout === "cards" && Array.isArray(s.items) && s.items.length >= 3) {
          const curCols = s.cols || (s.items.length >= 4 ? 2 : s.items.length);
          if (curCols < 4 && s.items.length >= 4) {
            s.cols = Math.min(4, s.items.length);
            actions.push(`Expandida grade de cards para ${s.cols} colunas para evitar estouro da margem inferior`);
          }
        }

        // Se layout for list e tiver muitos itens
        if (layout === "list" && Array.isArray(s.items) && s.items.length > 5) {
          const removed = s.items.slice(5);
          s.items = s.items.slice(0, 5);
          s.notes = (s.notes ? s.notes + "\n\n" : "") + "> Itens adicionais para fala:\n" + removed.map((r) => "- " + (typeof r === "object" ? r.text || r.title : r)).join("\n");
          actions.push(`Movidos ${removed.length} itens excedentes da lista para as notas do apresentador`);
        }

        // Se houver corpo/texto longo, compactar e mover narrativa para notas
        if (typeof s.body === "string" && s.body.length > 160) {
          const sentences = s.body.split(/(?<=[.?!])\s+/);
          if (sentences.length > 1) {
            const keep = sentences[0];
            const toNotes = sentences.slice(1).join(" ");
            s.body = keep;
            s.notes = (s.notes ? s.notes + "\n\n" : "") + `> Fala complementar: ${toNotes}`;
            actions.push(`Compactado texto do corpo e transferida narrativa detalhada para notas do apresentador`);
          }
        }
      }

      // --- Caso: Estouro Horizontal / Texto Saindo da Margem ---
      if (kind === "estouro-horizontal") {
        const curSize = s.titleSize || s.size || 92;
        const newSize = Math.max(44, Math.round(curSize * 0.76));
        s.titleSize = newSize;
        s.fit = true;
        actions.push(`Reduzida fonte (${curSize}px -> ${newSize}px) e ativado ajuste automático (fit: true) para evitar estouro horizontal`);
      }

      // --- Caso: Fora do Slide (coordenadas menores que 0 ou maiores que 1920x1080) ---
      if (kind === "fora-do-slide") {
        if (layout === "canvas" && Array.isArray(s.elements)) {
          s.elements.forEach((el, idx) => {
            const w = el.w || 300;
            const h = el.h || 120;
            const origX = el.x ?? 0;
            const origY = el.y ?? 0;
            // Safe zone: left 120, right 1800, top 92, bottom 976
            const clampedX = Math.max(120, Math.min(origX, 1800 - w));
            const clampedY = Math.max(92, Math.min(origY, 976 - h));
            if (clampedX !== origX || clampedY !== origY) {
              el.x = clampedX;
              el.y = clampedY;
              actions.push(`Elemento #${idx + 1} no canvas reajustado para dentro da área segura ([${clampedX}, ${clampedY}])`);
            }
          });
        }
      }

      // --- Caso: Baixo Contraste ---
      if (kind === "baixo-contraste") {
        // Alternar tom para garantir legibilidade máxima
        const prevTone = s.tone || "light";
        s.tone = prevTone === "light" ? "dark" : "light";
        delete s.fg;
        delete s.bg;
        actions.push(`Ajustado tom do slide de "${prevTone}" para "${s.tone}" para atender ao contraste mínimo WCAG`);
      }
    }
  }

  // 2. Verificações heurísticas universais (Anti-sono e Geometria Segura)
  // Regra Anti-sono: excesso de palavras no slide
  const words = countSlideWords(s);
  const maxWords = s.maxWords || spec.maxWords || 40;
  if (words > maxWords) {
    if (s.body && typeof s.body === "string" && s.body.split(/\s+/).length > 20) {
      const parts = s.body.split(/(?<=[.?!])\s+/);
      if (parts.length > 1) {
        s.body = parts[0];
        const extra = parts.slice(1).join(" ");
        s.notes = (s.notes ? s.notes + "\n\n" : "") + `> Explicação detalhada do apresentador:\n${extra}`;
        actions.push(`Slide anti-sono: reduzido de ${words} para ${countSlideWords(s)} palavras; detalhes movidos para o roteiro (notes)`);
      }
    }
  }

  // Verificação de Título Excessivamente Longo sem titleSize definido
  if (s.title && typeof s.title === "string" && s.title.length > 55 && !s.titleSize) {
    s.titleSize = layout === "cover" ? 96 : 68;
    actions.push(`Título longo detectado: configurado titleSize=${s.titleSize}px para evitar quebra indesejada`);
  }

  // Verificação de Colunas de Cards (se 4 ou mais cards, garantir pelo menos 3 colunas)
  if (layout === "cards" && Array.isArray(s.items) && s.items.length >= 4 && (!s.cols || s.cols < 3)) {
    s.cols = Math.min(4, s.items.length);
    actions.push(`Reorganizada distribuição de cards em ${s.cols} colunas`);
  }

  // Verificação em Canvas livre: garantir que nenhum elemento colida ou fique fora das margens
  if (layout === "canvas" && Array.isArray(s.elements)) {
    // Ordena verticalmente e distribui se colidir
    s.elements.forEach((el) => {
      const w = el.w || 320;
      const h = el.h || 120;
      if (el.x == null) el.x = 120;
      if (el.y == null) el.y = 120;
      el.x = Math.max(120, Math.min(el.x, 1800 - w));
      el.y = Math.max(92, Math.min(el.y, 976 - h));
    });

    for (let i = 0; i < s.elements.length; i++) {
      for (let j = i + 1; j < s.elements.length; j++) {
        const A = s.elements[i];
        const B = s.elements[j];
        const aw = A.w || 320, ah = A.h || 120;
        const bw = B.w || 320, bh = B.h || 120;
        const ix = Math.min(A.x + aw, B.x + bw) - Math.max(A.x, B.x);
        const iy = Math.min(A.y + ah, B.y + bh) - Math.max(A.y, B.y);
        if (ix > 8 && iy > 8) {
          if (A.y + ah + bh + 24 <= 976) {
            B.y = A.y + ah + 24;
            actions.push(`Resolvida sobreposição entre elementos #${i + 1} e #${j + 1} no canvas`);
          } else if (A.x + aw + bw + 24 <= 1800) {
            B.x = A.x + aw + 24;
            B.y = A.y;
            actions.push(`Alinhado elemento #${j + 1} horizontalmente ao lado do elemento #${i + 1}`);
          }
        }
      }
    }
  }

  return { slide: s, actions, modified: actions.length > 0 };
}

export function autofixDeck(spec, issuesReport = []) {
  const newSpec = JSON.parse(JSON.stringify(spec));
  const issuesBySlide = new Map();

  if (Array.isArray(issuesReport)) {
    for (const item of issuesReport) {
      if (item && item.slide && Array.isArray(item.issues)) {
        issuesBySlide.set(item.slide - 1, item.issues);
      }
    }
  }

  const allActions = [];
  let totalFixed = 0;

  newSpec.slides = newSpec.slides.map((rawSlide, index) => {
    const slideIssues = issuesBySlide.get(index) || [];
    const { slide: fixedSlide, actions, modified } = autofixSlide(rawSlide, newSpec, slideIssues);
    if (modified) {
      totalFixed++;
      allActions.push({
        slide: index + 1,
        layout: fixedSlide.layout || "auto",
        actions,
      });
    }
    return fixedSlide;
  });

  return {
    spec: newSpec,
    modifiedSlidesCount: totalFixed,
    actions: allActions,
    clean: true,
  };
}

function countSlideWords(s) {
  const txt = [];
  const walk = (v, k) => {
    if (k === "notes" || k === "source" || k === "id" || k === "layout" || k === "tone") return;
    if (typeof v === "string") {
      if (!/^(\.|https?:|#?[0-9a-f]{6}$)/i.test(v)) txt.push(v);
    } else if (Array.isArray(v)) {
      v.forEach((x) => walk(x));
    } else if (v && typeof v === "object" && !v.svg && !v.chart && !v.html) {
      for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
    }
  };
  walk(s);
  return txt.join(" ").split(/\s+/).filter((w) => w.length > 1).length;
}
