const EXTENSIONS = new Map([
  [".py", "Python"],
  [".pyw", "Python"],
  [".java", "Java"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".mjs", "JavaScript"],
  [".cjs", "JavaScript"],
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".mts", "TypeScript"],
  [".cts", "TypeScript"],
  [".cs", "C#"],
]);

const ALIASES = new Map([
  ["python", "Python"],
  ["py", "Python"],
  ["java", "Java"],
  ["javascript", "JavaScript"],
  ["js", "JavaScript"],
  ["node", "JavaScript"],
  ["nodejs", "JavaScript"],
  ["typescript", "TypeScript"],
  ["ts", "TypeScript"],
  ["c#", "C#"],
  ["csharp", "C#"],
  ["cs", "C#"],
]);

export function inferCodeLanguage(filename) {
  const basename = String(filename || "").trim().split(/[\\/]/).pop() || "";
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return "";
  const extension = basename.slice(dot).toLowerCase();
  return EXTENSIONS.get(extension) || "";
}

export function normalizeCodeLanguage(language) {
  const key = String(language || "").trim().toLowerCase().replace(/[\s._-]/g, "");
  return ALIASES.get(key) || "";
}

export function resolveCodeLanguage(language, filename) {
  const requested = String(language || "").trim();
  return requested ? normalizeCodeLanguage(requested) : inferCodeLanguage(filename);
}

export function displayCodeLanguage(language, filename) {
  const requested = String(language || "").trim();
  return normalizeCodeLanguage(requested) || requested || inferCodeLanguage(filename);
}
