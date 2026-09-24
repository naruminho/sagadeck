// Temas do sagadeck.
//
// Cada tema define:
//   colors  – paleta base (hex sem '#', como o PowerPoint gosta)
//   tones   – "tons" de slide: light | dark | accent | alert. Cada tom remapeia
//             as variáveis --bg/--fg/--muted/--line/--surface/--hi/--em
//   faces   – papéis tipográficos (display, heading, body, label, mono, quote).
//             `css` é o que o navegador usa; `pptx` é a face exata que o PowerPoint
//             vai usar. Usamos fontes que existem no Windows/Office, então o HTML e
//             o .pptx ficam iguais na máquina de quem apresenta.
//   fontFaces – @font-face extras (ex.: Bahnschrift variável com eixo de largura)
//   deco    – decoração de fundo opcional (grain, grid, none)
//
// Temas customizados no YAML: theme: { extends: sinal, colors: { accent: "3DDC97" } }

const SYS_SANS = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const SYS_MONO = "'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace";

export const THEMES = {
  sinal: {
    label: "Sinal — sinalização/segurança: DIN condensada, amarelo de aviso, pictogramas",
    colors: {
      paper: "F2F0EB", ink: "121212", accent: "FFC20E", alert: "E4401F",
      muted: "6F6C66", line: "D6D2C8", surface: "E7E4DC", surfaceDark: "1E1E1E",
      c1: "FFC20E", c2: "121212", c3: "E4401F", c4: "8C8880", c5: "3F3D39",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "accent", em: "alert", onHi: "ink" },
      dark: { bg: "ink", fg: "paper", muted: "9C988F", line: "3A3936", surface: "surfaceDark", hi: "accent", em: "accent", onHi: "ink" },
      accent: { bg: "accent", fg: "ink", muted: "5B4A10", line: "D9A300", surface: "FFD24D", hi: "ink", em: "ink", onHi: "accent" },
      alert: { bg: "alert", fg: "FFFFFF", muted: "FFD2C6", line: "F07A5E", surface: "C93517", hi: "ink", em: "ink", onHi: "FFFFFF" },
    },
    fontFaces: [
      { family: "SagaDIN", src: "local('Bahnschrift')", weight: "300 700", stretch: "75% 100%" },
    ],
    faces: {
      display: { css: "font-family: SagaDIN, 'Arial Narrow', sans-serif; font-weight: 700; font-stretch: 75%; letter-spacing: -0.005em; line-height: 0.92;", pptx: { face: "Bahnschrift Condensed", bold: true } },
      heading: { css: "font-family: SagaDIN, Arial, sans-serif; font-weight: 600; font-stretch: 87.5%; letter-spacing: 0; line-height: 1.02;", pptx: { face: "Bahnschrift SemiBold SemiConden" } },
      body: { css: "font-family: SagaDIN, Arial, sans-serif; font-weight: 400; font-stretch: 100%; line-height: 1.28;", pptx: { face: "Bahnschrift" }, pptxBold: { face: "Bahnschrift SemiBold" } },
      label: { css: "font-family: SagaDIN, Arial, sans-serif; font-weight: 600; font-stretch: 100%; letter-spacing: 0.14em; text-transform: uppercase; line-height: 1.2;", pptx: { face: "Bahnschrift SemiBold" } },
      mono: { css: `font-family: ${SYS_MONO}; font-weight: 400; line-height: 1.4;`, pptx: { face: "Cascadia Mono" }, pptxBold: { face: "Cascadia Mono SemiBold" } },
      quote: { css: "font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 400; line-height: 1.12; letter-spacing: -0.01em;", pptx: { face: "Georgia", italic: true } },
    },
    radius: 14, deco: "grain",
  },

  editorial: {
    label: "Editorial — revista: serifada grande, muito branco, um vermelho-tomate",
    colors: {
      paper: "FAF9F6", ink: "141414", accent: "E0432B", alert: "E0432B",
      muted: "6B6A66", line: "DEDBD4", surface: "F0EEE8", surfaceDark: "222222",
      c1: "E0432B", c2: "141414", c3: "8C8A84", c4: "C9C5BC", c5: "F2A28F",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "F7D9D2", em: "accent", onHi: "ink" },
      dark: { bg: "ink", fg: "paper", muted: "A09E98", line: "3A3A3A", surface: "surfaceDark", hi: "accent", em: "F26A52", onHi: "FFFFFF" },
      accent: { bg: "accent", fg: "FFFFFF", muted: "FFD9D1", line: "F07A66", surface: "C8361F", hi: "ink", em: "ink", onHi: "FFFFFF" },
      alert: { bg: "ink", fg: "paper", muted: "A09E98", line: "3A3A3A", surface: "surfaceDark", hi: "accent", em: "F26A52", onHi: "FFFFFF" },
    },
    fontFaces: [],
    faces: {
      display: { css: "font-family: Georgia, 'Times New Roman', serif; font-weight: 400; letter-spacing: -0.025em; line-height: 0.98;", pptx: { face: "Georgia" } },
      heading: { css: "font-family: Georgia, serif; font-weight: 400; letter-spacing: -0.015em; line-height: 1.05;", pptx: { face: "Georgia" } },
      body: { css: `font-family: ${SYS_SANS}; font-weight: 400; line-height: 1.34;`, pptx: { face: "Segoe UI" }, pptxBold: { face: "Segoe UI Semibold" } },
      label: { css: `font-family: ${SYS_SANS}; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; line-height: 1.2;`, pptx: { face: "Segoe UI Semibold" } },
      mono: { css: `font-family: ${SYS_MONO}; line-height: 1.4;`, pptx: { face: "Cascadia Mono" } },
      quote: { css: "font-family: Georgia, serif; font-style: italic; line-height: 1.12; letter-spacing: -0.015em;", pptx: { face: "Georgia", italic: true } },
    },
    radius: 4, deco: "none",
  },

  noite: {
    label: "Noite — escuro elegante: Segoe fina, latão, contraste alto",
    colors: {
      paper: "0F1115", ink: "EDEBE6", accent: "E4B660", alert: "FF6B57",
      muted: "8E8C86", line: "2A2D33", surface: "181B21", surfaceDark: "181B21",
      c1: "E4B660", c2: "EDEBE6", c3: "FF6B57", c4: "6F7C8A", c5: "A99A7A",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "accent", em: "accent", onHi: "0F1115" },
      dark: { bg: "08090B", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "accent", em: "accent", onHi: "0F1115" },
      accent: { bg: "accent", fg: "0F1115", muted: "5E4A22", line: "C79A45", surface: "EBC57C", hi: "0F1115", em: "0F1115", onHi: "accent" },
      alert: { bg: "alert", fg: "0F1115", muted: "5A1E16", line: "E05645", surface: "FF8A7A", hi: "0F1115", em: "0F1115", onHi: "alert" },
    },
    fontFaces: [],
    faces: {
      display: { css: `font-family: 'Segoe UI Light', 'Segoe UI', ${SYS_SANS}; font-weight: 300; letter-spacing: -0.03em; line-height: 0.98;`, pptx: { face: "Segoe UI Light" } },
      heading: { css: `font-family: 'Segoe UI Semibold', 'Segoe UI', ${SYS_SANS}; font-weight: 600; letter-spacing: -0.01em; line-height: 1.08;`, pptx: { face: "Segoe UI Semibold" } },
      body: { css: `font-family: ${SYS_SANS}; font-weight: 400; line-height: 1.36;`, pptx: { face: "Segoe UI" }, pptxBold: { face: "Segoe UI Semibold" } },
      label: { css: `font-family: 'Segoe UI Semibold', ${SYS_SANS}; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; line-height: 1.2;`, pptx: { face: "Segoe UI Semibold" } },
      mono: { css: `font-family: ${SYS_MONO}; line-height: 1.4;`, pptx: { face: "Cascadia Mono" } },
      quote: { css: "font-family: Georgia, serif; font-style: italic; line-height: 1.15;", pptx: { face: "Georgia", italic: true } },
    },
    radius: 18, deco: "none",
  },

  bauhaus: {
    label: "Bauhaus — geométrico: Century Gothic, vermelho/azul/amarelo primários",
    colors: {
      paper: "F3EEE3", ink: "1A1A1A", accent: "D93A2B", alert: "1F4AA8",
      muted: "6E6A60", line: "D8D1C2", surface: "E8E1D2", surfaceDark: "262626",
      c1: "D93A2B", c2: "1F4AA8", c3: "F2B33D", c4: "1A1A1A", c5: "9C958A",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "F2B33D", em: "accent", onHi: "ink" },
      dark: { bg: "ink", fg: "paper", muted: "A7A195", line: "3A3A3A", surface: "surfaceDark", hi: "F2B33D", em: "F2B33D", onHi: "ink" },
      accent: { bg: "accent", fg: "FFFFFF", muted: "FFD6CF", line: "E86C5E", surface: "B92E21", hi: "F2B33D", em: "F2B33D", onHi: "ink" },
      alert: { bg: "1F4AA8", fg: "FFFFFF", muted: "C9D6F2", line: "4C6FC0", surface: "183C8C", hi: "F2B33D", em: "F2B33D", onHi: "ink" },
    },
    fontFaces: [],
    faces: {
      display: { css: "font-family: 'Century Gothic', 'Futura', sans-serif; font-weight: 700; letter-spacing: -0.03em; line-height: 0.95;", pptx: { face: "Century Gothic", bold: true } },
      heading: { css: "font-family: 'Century Gothic', 'Futura', sans-serif; font-weight: 700; letter-spacing: -0.01em; line-height: 1.05;", pptx: { face: "Century Gothic", bold: true } },
      body: { css: "font-family: 'Century Gothic', 'Futura', sans-serif; font-weight: 400; line-height: 1.34;", pptx: { face: "Century Gothic" } },
      label: { css: "font-family: 'Century Gothic', sans-serif; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; line-height: 1.2;", pptx: { face: "Century Gothic", bold: true } },
      mono: { css: `font-family: ${SYS_MONO}; line-height: 1.4;`, pptx: { face: "Cascadia Mono" } },
      quote: { css: "font-family: 'Century Gothic', sans-serif; font-style: italic; line-height: 1.15;", pptx: { face: "Century Gothic", italic: true } },
    },
    radius: 0, deco: "none",
  },

  terminal: {
    label: "Terminal — dados/tech sem neon: monoespaçada, âmbar, fundo grafite",
    colors: {
      paper: "0D0E0D", ink: "DAD6CC", accent: "FFB224", alert: "FF5F4A",
      muted: "85817A", line: "2A2B29", surface: "171816", surfaceDark: "171816",
      c1: "FFB224", c2: "DAD6CC", c3: "FF5F4A", c4: "6E8B74", c5: "8A7F6A",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "accent", em: "accent", onHi: "0D0E0D" },
      dark: { bg: "050505", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "accent", em: "accent", onHi: "0D0E0D" },
      accent: { bg: "accent", fg: "0D0E0D", muted: "6B4A0A", line: "D9941A", surface: "FFC45A", hi: "0D0E0D", em: "0D0E0D", onHi: "accent" },
      alert: { bg: "alert", fg: "0D0E0D", muted: "5C1A12", line: "E0503D", surface: "FF7F6D", hi: "0D0E0D", em: "0D0E0D", onHi: "alert" },
    },
    fontFaces: [],
    faces: {
      display: { css: `font-family: 'Cascadia Mono SemiBold', 'Cascadia Mono', ${SYS_MONO}; font-weight: 600; letter-spacing: -0.03em; line-height: 1.0;`, pptx: { face: "Cascadia Mono SemiBold" } },
      heading: { css: `font-family: 'Cascadia Mono SemiBold', 'Cascadia Mono', ${SYS_MONO}; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1;`, pptx: { face: "Cascadia Mono SemiBold" } },
      body: { css: `font-family: ${SYS_SANS}; font-weight: 400; line-height: 1.36;`, pptx: { face: "Segoe UI" }, pptxBold: { face: "Segoe UI Semibold" } },
      label: { css: `font-family: ${SYS_MONO}; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1.2;`, pptx: { face: "Cascadia Mono" } },
      mono: { css: `font-family: ${SYS_MONO}; line-height: 1.4;`, pptx: { face: "Cascadia Mono" } },
      quote: { css: `font-family: ${SYS_MONO}; font-style: italic; line-height: 1.2;`, pptx: { face: "Cascadia Mono", italic: true } },
    },
    radius: 6, deco: "grid",
  },

  jornal: {
    label: "Jornal — manchete: Franklin Gothic pesada, papel-jornal, azul-tinta",
    colors: {
      paper: "F4F1EA", ink: "111111", accent: "1D5FA8", alert: "C8352B",
      muted: "66625B", line: "D3CEC3", surface: "E9E5DB", surfaceDark: "1F1F1F",
      c1: "1D5FA8", c2: "111111", c3: "C8352B", c4: "8E8A82", c5: "7FA7D4",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "D5E3F3", em: "accent", onHi: "ink" },
      dark: { bg: "ink", fg: "paper", muted: "A29E96", line: "3B3B3B", surface: "surfaceDark", hi: "accent", em: "7FA7D4", onHi: "FFFFFF" },
      accent: { bg: "accent", fg: "FFFFFF", muted: "CFE0F4", line: "4B80BD", surface: "174F8C", hi: "ink", em: "ink", onHi: "FFFFFF" },
      alert: { bg: "alert", fg: "FFFFFF", muted: "FFD4CF", line: "DE6259", surface: "A62B22", hi: "ink", em: "ink", onHi: "FFFFFF" },
    },
    fontFaces: [],
    faces: {
      display: { css: "font-family: 'Franklin Gothic Heavy', 'Franklin Gothic', 'Arial Black', sans-serif; font-weight: 400; letter-spacing: -0.015em; line-height: 0.94;", pptx: { face: "Franklin Gothic Heavy" } },
      heading: { css: "font-family: 'Franklin Gothic Demi', 'Franklin Gothic', Arial, sans-serif; font-weight: 400; line-height: 1.05;", pptx: { face: "Franklin Gothic Demi" } },
      body: { css: "font-family: 'Franklin Gothic Book', 'Franklin Gothic', Arial, sans-serif; font-weight: 400; line-height: 1.32;", pptx: { face: "Franklin Gothic Book" }, pptxBold: { face: "Franklin Gothic Demi" } },
      label: { css: "font-family: 'Franklin Gothic Demi', Arial, sans-serif; font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; line-height: 1.2;", pptx: { face: "Franklin Gothic Demi" } },
      mono: { css: `font-family: ${SYS_MONO}; line-height: 1.4;`, pptx: { face: "Cascadia Mono" } },
      quote: { css: "font-family: Georgia, serif; font-style: italic; line-height: 1.14;", pptx: { face: "Georgia", italic: true } },
    },
    radius: 0, deco: "none",
  },

  rabisco: {
    label: "Rabisco — artesanal & lousa: fontes desenhadas à mão, doodles, post-its e traços orgânicos",
    colors: {
      paper: "FFFDF6", ink: "2B2824", accent: "FF5C5C", alert: "E84118",
      muted: "736D65", line: "E5DCCB", surface: "FFF7DB", surfaceDark: "302C28",
      c1: "FF5C5C", c2: "2E86DE", c3: "FBC531", c4: "4CD137", c5: "9C88FF",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "FBC531", em: "accent", onHi: "ink" },
      dark: { bg: "ink", fg: "paper", muted: "B0A89C", line: "4A453F", surface: "surfaceDark", hi: "FBC531", em: "accent", onHi: "ink" },
      accent: { bg: "accent", fg: "FFFFFF", muted: "FFD0D0", line: "FF8585", surface: "D93838", hi: "FBC531", em: "ink", onHi: "ink" },
      alert: { bg: "alert", fg: "FFFFFF", muted: "FFC5B8", line: "FF6E4A", surface: "B82805", hi: "FBC531", em: "ink", onHi: "FFFFFF" },
    },
    fontFaces: [],
    faces: {
      display: { css: "font-family: 'Caveat', 'Patrick Hand', 'Comic Sans MS', 'Ink Free', 'Segoe Print', cursive; font-weight: 700; letter-spacing: 0.01em; line-height: 1.02;", pptx: { face: "Ink Free", bold: true } },
      heading: { css: "font-family: 'Caveat', 'Patrick Hand', 'Comic Sans MS', 'Ink Free', 'Segoe Print', cursive; font-weight: 700; letter-spacing: 0; line-height: 1.08;", pptx: { face: "Ink Free" } },
      body: { css: "font-family: 'Patrick Hand', 'Comic Neue', 'Comic Sans MS', 'Segoe UI', cursive, sans-serif; font-weight: 400; line-height: 1.34;", pptx: { face: "Comic Sans MS" }, pptxBold: { face: "Comic Sans MS", bold: true } },
      label: { css: "font-family: 'Patrick Hand', 'Comic Neue', 'Comic Sans MS', cursive; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1.2;", pptx: { face: "Comic Sans MS", bold: true } },
      mono: { css: `font-family: ${SYS_MONO}; line-height: 1.4;`, pptx: { face: "Cascadia Mono" } },
      quote: { css: "font-family: 'Caveat', 'Ink Free', cursive; font-style: normal; font-weight: 700; line-height: 1.1;", pptx: { face: "Ink Free", bold: true } },
    },
    radius: 18, deco: "sketch",
  },

  oceano: {
    label: "Oceano — azul elétrico vivo: visual ultra vibrante, dinâmico, moderno e luminoso",
    colors: {
      paper: "F0F6FF", ink: "091830", accent: "0062FF", alert: "FF3B69",
      muted: "4D6585", line: "D4E4FC", surface: "E2EEFD", surfaceDark: "0E2242",
      c1: "0062FF", c2: "00C6FF", c3: "6366F1", c4: "00DF89", c5: "FFB800",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "0062FF", em: "accent", onHi: "FFFFFF" },
      dark: { bg: "071120", fg: "F0F6FF", muted: "86A2C7", line: "1A3358", surface: "surfaceDark", hi: "00C6FF", em: "00C6FF", onHi: "091830" },
      accent: { bg: "accent", fg: "FFFFFF", muted: "BFDBFE", line: "3B82F6", surface: "004EC4", hi: "00C6FF", em: "FFFFFF", onHi: "091830" },
      alert: { bg: "alert", fg: "FFFFFF", muted: "FFE4EB", line: "FF668B", surface: "D61A47", hi: "FFFFFF", em: "FFFFFF", onHi: "091830" },
    },
    fontFaces: [],
    faces: {
      display: { css: "font-family: 'Plus Jakarta Sans', 'Segoe UI', -apple-system, sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: 0.94;", pptx: { face: "Segoe UI", bold: true } },
      heading: { css: "font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; font-weight: 700; letter-spacing: -0.015em; line-height: 1.04;", pptx: { face: "Segoe UI Semibold" } },
      body: { css: "font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; font-weight: 450; line-height: 1.34;", pptx: { face: "Segoe UI" }, pptxBold: { face: "Segoe UI Semibold" } },
      label: { css: "font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; line-height: 1.2;", pptx: { face: "Segoe UI Semibold" } },
      mono: { css: `font-family: ${SYS_MONO}; line-height: 1.4;`, pptx: { face: "Cascadia Mono" } },
      quote: { css: "font-family: Georgia, serif; font-style: italic; line-height: 1.15; letter-spacing: -0.01em;", pptx: { face: "Georgia", italic: true } },
    },
    radius: 16, deco: "glow",
  },

  pop: {
    label: "Pop — alegre & chiclete: paleta super animada, cartelas fofas, roxo, rosa, menta e sol",
    colors: {
      paper: "FFF9F2", ink: "191534", accent: "8B5CF6", alert: "EC4899",
      muted: "6C6885", line: "FED7AA", surface: "FEF3C7", surfaceDark: "2B2252",
      c1: "8B5CF6", c2: "EC4899", c3: "06B6D4", c4: "10B981", c5: "F59E0B",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "FDE047", em: "accent", onHi: "ink" },
      dark: { bg: "120E29", fg: "FFF9F2", muted: "9D97B8", line: "352E5E", surface: "surfaceDark", hi: "FDE047", em: "alert", onHi: "ink" },
      accent: { bg: "accent", fg: "FFFFFF", muted: "E9D5FF", line: "A855F7", surface: "7C3AED", hi: "FDE047", em: "FFFFFF", onHi: "ink" },
      alert: { bg: "alert", fg: "FFFFFF", muted: "FCE7F3", line: "F472B6", surface: "DB2777", hi: "FDE047", em: "FFFFFF", onHi: "ink" },
    },
    fontFaces: [],
    faces: {
      display: { css: "font-family: 'Fredoka', 'Century Gothic', -apple-system, sans-serif; font-weight: 700; letter-spacing: -0.02em; line-height: 0.96;", pptx: { face: "Century Gothic", bold: true } },
      heading: { css: "font-family: 'Fredoka', 'Century Gothic', sans-serif; font-weight: 600; line-height: 1.06;", pptx: { face: "Century Gothic", bold: true } },
      body: { css: "font-family: 'Century Gothic', -apple-system, sans-serif; font-weight: 400; line-height: 1.34;", pptx: { face: "Century Gothic" }, pptxBold: { face: "Century Gothic", bold: true } },
      label: { css: "font-family: 'Century Gothic', sans-serif; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; line-height: 1.2;", pptx: { face: "Century Gothic", bold: true } },
      mono: { css: `font-family: ${SYS_MONO}; line-height: 1.4;`, pptx: { face: "Cascadia Mono" } },
      quote: { css: "font-family: 'Fredoka', 'Century Gothic', sans-serif; font-style: italic; line-height: 1.15;", pptx: { face: "Century Gothic", italic: true } },
    },
    radius: 26, deco: "dots",
  },

  aurora: {
    label: "Aurora — noite mágica: fundo escuro espacial com luzes vivas em neon ciano, violeta e magenta",
    colors: {
      paper: "0A0D17", ink: "F8FAFC", accent: "00F2FE", alert: "FF007A",
      muted: "94A3B8", line: "1E293B", surface: "131A2B", surfaceDark: "131A2B",
      c1: "00F2FE", c2: "4FACFE", c3: "7F00FF", c4: "FF007A", c5: "00FF87",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "accent", em: "accent", onHi: "0A0D17" },
      dark: { bg: "05070D", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "accent", em: "accent", onHi: "0A0D17" },
      accent: { bg: "1E1B4B", fg: "FFFFFF", muted: "C7D2FE", line: "4338CA", surface: "312E81", hi: "accent", em: "00F2FE", onHi: "0A0D17" },
      alert: { bg: "4C0519", fg: "FFFFFF", muted: "FECDD3", line: "9F1239", surface: "881337", hi: "accent", em: "FF007A", onHi: "0A0D17" },
    },
    fontFaces: [],
    faces: {
      display: { css: "font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; font-weight: 800; letter-spacing: -0.03em; line-height: 0.95;", pptx: { face: "Segoe UI", bold: true } },
      heading: { css: "font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; font-weight: 700; letter-spacing: -0.01em; line-height: 1.05;", pptx: { face: "Segoe UI Semibold" } },
      body: { css: "font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; font-weight: 400; line-height: 1.36;", pptx: { face: "Segoe UI" }, pptxBold: { face: "Segoe UI Semibold" } },
      label: { css: "font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; line-height: 1.2;", pptx: { face: "Segoe UI Semibold" } },
      mono: { css: `font-family: ${SYS_MONO}; line-height: 1.4;`, pptx: { face: "Cascadia Mono" } },
      quote: { css: "font-family: Georgia, serif; font-style: italic; line-height: 1.15;", pptx: { face: "Georgia", italic: true } },
    },
    radius: 20, deco: "aurora",
  },

  prata: {
    label: "Prata — Keynote clean & espacial: prata acetinado, muito respiro, tipografia SF / Inter limpa e elegante",
    colors: {
      paper: "F5F5F7", ink: "1D1D1F", accent: "0071E3", alert: "FF3B30",
      muted: "86868B", line: "D2D2D7", surface: "FFFFFF", surfaceDark: "161617",
      c1: "0071E3", c2: "1D1D1F", c3: "86868B", c4: "E5E5EA", c5: "3A3A3C",
    },
    tones: {
      light: { bg: "paper", fg: "ink", muted: "muted", line: "line", surface: "surface", hi: "E8E8ED", em: "accent", onHi: "ink" },
      dark: { bg: "000000", fg: "F5F5F7", muted: "86868B", line: "2C2C2E", surface: "surfaceDark", hi: "3A3A3C", em: "2997FF", onHi: "FFFFFF" },
      accent: { bg: "accent", fg: "FFFFFF", muted: "D0E6FF", line: "479DFF", surface: "005BB5", hi: "FFFFFF", em: "FFFFFF", onHi: "0071E3" },
      alert: { bg: "alert", fg: "FFFFFF", muted: "FFD1CF", line: "FF6961", surface: "D32F2F", hi: "FFFFFF", em: "FFFFFF", onHi: "alert" },
    },
    fontFaces: [],
    faces: {
      display: { css: "font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', 'Helvetica Neue', sans-serif; font-weight: 600; letter-spacing: -0.035em; line-height: 0.98;", pptx: { face: "Segoe UI", bold: true } },
      heading: { css: "font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', sans-serif; font-weight: 600; letter-spacing: -0.015em; line-height: 1.06;", pptx: { face: "Segoe UI Semibold" } },
      body: { css: "font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', sans-serif; font-weight: 400; letter-spacing: -0.005em; line-height: 1.38;", pptx: { face: "Segoe UI" }, pptxBold: { face: "Segoe UI Semibold" } },
      label: { css: "font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', sans-serif; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; line-height: 1.2;", pptx: { face: "Segoe UI Semibold" } },
      mono: { css: `font-family: 'SF Mono', ${SYS_MONO}; line-height: 1.4;`, pptx: { face: "Cascadia Mono" } },
      quote: { css: "font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif; font-weight: 400; letter-spacing: -0.02em; line-height: 1.15;", pptx: { face: "Segoe UI Light" } },
    },
    radius: 20, deco: "silver",
  },
};

export function resolveTheme(spec) {
  const t = typeof spec === "string" ? { extends: spec } : spec || {};
  const base = THEMES[t.extends || "sinal"];
  if (!base) throw new Error(`Tema desconhecido: ${t.extends}. Disponíveis: ${Object.keys(THEMES).join(", ")}`);
  const theme = structuredClone(base);
  theme.name = t.extends || "sinal";
  Object.assign(theme.colors, t.colors || {});
  for (const [k, v] of Object.entries(t.tones || {})) theme.tones[k] = { ...(theme.tones[k] || {}), ...v };
  for (const [k, v] of Object.entries(t.faces || {})) theme.faces[k] = { ...(theme.faces[k] || {}), ...v };
  if (t.fontFaces) theme.fontFaces = [...theme.fontFaces, ...t.fontFaces];
  if (t.radius != null) theme.radius = t.radius;
  if (t.deco != null) theme.deco = t.deco;
  return theme;
}

// cor por nome ("accent", "ink") ou hex
export function col(theme, v) {
  if (!v) return v;
  const s = String(v).replace(/^#/, "");
  if (theme.colors[s]) return theme.colors[s];
  return s;
}

export function themeCSS(theme) {
  const c = (v) => "#" + col(theme, v);
  let css = "";
  for (const f of theme.fontFaces || []) {
    css += `@font-face{font-family:${f.family};src:${f.src};${f.weight ? `font-weight:${f.weight};` : ""}${f.stretch ? `font-stretch:${f.stretch};` : ""}${f.style ? `font-style:${f.style};` : ""}}\n`;
  }
  css += `:root{`;
  for (const [k, v] of Object.entries(theme.colors)) css += `--c-${k}:#${v};`;
  css += `--radius:${theme.radius}px;}\n`;
  for (const [tone, m] of Object.entries(theme.tones)) {
    css += `.tone-${tone}{--bg:${c(m.bg)};--fg:${c(m.fg)};--muted:${c(m.muted)};--line:${c(m.line)};--surface:${c(m.surface)};--hi:${c(m.hi)};--em:${c(m.em)};--on-hi:${c(m.onHi)};}\n`;
  }
  for (const [name, f] of Object.entries(theme.faces)) css += `.f-${name}{${f.css}}\n`;
  return css;
}

// Mapa usado pelo exportador de PPTX: alias CSS da família -> face do PowerPoint.
export function pptxFontMap(theme) {
  return Object.fromEntries(Object.entries(theme.faces).map(([k, f]) => [k, { regular: f.pptx, bold: f.pptxBold || { ...f.pptx, bold: true } }]));
}
