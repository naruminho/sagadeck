import { esc } from "./markup.js";

const KEYWORDS = {
  Python: new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" ")),
  Java: new Set("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record".split(" ")),
  JavaScript: new Set("async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield".split(" ")),
  TypeScript: new Set("abstract any as asserts async await bigint boolean break case catch class const constructor continue declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface is keyof let namespace never new number object of package private protected public readonly return set static string super switch symbol this throw try type typeof undefined unique unknown var void while with yield".split(" ")),
  "C#": new Set("abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using virtual void volatile while".split(" ")),
};

const TYPES = {
  Python: new Set("bool dict float int list object set str tuple".split(" ")),
  Java: new Set("ArrayList Boolean Byte Character Double Float Integer List Long Map Object Set Short String".split(" ")),
  JavaScript: new Set("Array Boolean Date Map Number Object Promise Set String".split(" ")),
  TypeScript: new Set("Array any bigint boolean never number object string symbol unknown void".split(" ")),
  "C#": new Set("bool byte char DateTime decimal double float int List long object short string Task uint ulong var void".split(" ")),
};

const CONSTANTS = new Set(["False", "None", "True", "false", "null", "true", "undefined", "NaN", "Infinity"]);

function tokenPattern(language) {
  const comments = language === "Python"
    ? "#[^\\n]*"
    : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/";
  const strings = language === "Python"
    ? "(?:[rRuUbBfF]{0,2})(?:'''[\\s\\S]*?'''|\"\"\"[\\s\\S]*?\"\"\"|'(?:\\\\.|[^'\\\\])*'|\"(?:\\\\.|[^\"\\\\])*\")"
    : "(?:\\$?@?\"(?:\"\"|\\\\.|[^\"\\\\])*\"|@?\"(?:\"\"|[^\"])*\"|'(?:\\\\.|[^'\\\\])*'|`(?:\\\\.|[^`\\\\])*`)";
  const number = "(?:\\b(?:0[xX][\\da-fA-F]+|0[bB][01]+|\\d+(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)(?:[fFdDlL])?|\\.\\d+(?:[eE][+-]?\\d+)?)";
  return new RegExp(`(?<comment>${comments})|(?<string>${strings})|(?<number>${number})|(?<identifier>[A-Za-z_$][\\w$]*)|(?<operator>[-+*/%=&|^!<>~?:]+)|(?<punctuation>[{}()\\[\\].,;])`, "g");
}

function classify(match, language, source, offset) {
  const groups = match.groups;
  if (groups.comment) return "comment";
  if (groups.string) return "string";
  if (groups.number) return "number";
  if (groups.identifier) {
    const word = groups.identifier;
    if (KEYWORDS[language].has(word)) return "keyword";
    if (CONSTANTS.has(word)) return "constant";
    if (TYPES[language].has(word)) return "type";
    if (/^\s*\(/.test(source.slice(offset + match[0].length))) return "function";
  }
  if (groups.operator) return "operator";
  if (groups.punctuation) return "punctuation";
  return "";
}

export function highlightCode(source, language) {
  const pattern = tokenPattern(language);
  const lines = [""];
  const append = (value, kind = "") => {
    const parts = value.split("\n");
    parts.forEach((part, index) => {
      if (index) lines.push("");
      if (part) lines[lines.length - 1] += kind ? `<span class="tok tok-${kind}">${esc(part)}</span>` : esc(part);
    });
  };

  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    append(source.slice(cursor, match.index));
    append(match[0], classify(match, language, source, match.index));
    cursor = match.index + match[0].length;
  }
  append(source.slice(cursor));
  return lines;
}
