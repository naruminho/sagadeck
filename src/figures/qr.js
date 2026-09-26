// QR code como SVG (um único path, nítido em qualquer tamanho e no PowerPoint).
//   { qr: "https://linkedin.com/in/…", size: 360, label: "LinkedIn", color: "#111", bg: "#fff" }
// O QR sempre sai escuro sobre claro, com margem ("quiet zone"): é o que os celulares leem melhor,
// inclusive quando o slide tem tom escuro.
import qrcode from "qrcode-generator";

export function qrSVG(data, { ec = "M", ink = "#111", paper = "#fff", margin = 2 } = {}) {
  const text = String(data ?? "").trim();
  if (!text) throw new Error("qr: informe o texto ou link do QR code (ex.: qr: https://linkedin.com/in/voce)");
  const q = qrcode(0, ec);
  q.addData(text, "Byte");
  q.make();
  const n = q.getModuleCount();
  const size = n + margin * 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c)) continue;
      let run = 1; // junta módulos escuros vizinhos da mesma linha num retângulo só (SVG menor)
      while (c + run < n && q.isDark(r, c + run)) run++;
      d += `M${c + margin} ${r + margin}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }
  return `<svg class="qr-svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code: ${escAttr(text)}">`
    + `<rect width="${size}" height="${size}" fill="${paper}"/><path d="${d}" fill="${ink}"/></svg>`;
}

const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
