import { esc } from "./markup.js";

const KEYWORDS = {
  Python: new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" ")),
  Java: new Set("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record".split(" ")),
  JavaScript: new Set("async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield".split(" ")),
  TypeScript: new Set("abstract any as asserts async await bigint boolean break case catch class const constructor continue declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface is keyof let namespace never new number object of package private protected public readonly return set static string super switch symbol this throw try type typeof undefined unique unknown var void while with yield".split(" ")),
  "C#": new Set("abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using virtual void volatile while".split(" ")),
  Bash: new Set("if then else elif fi for in do done while until case esac function select time export local readonly return exit source".split(" ")),
  JSON: new Set(),
  SQL: new Set("SELECT FROM WHERE JOIN INNER LEFT RIGHT FULL OUTER CROSS ON AS AND OR NOT IN IS NULL DISTINCT GROUP BY ORDER HAVING LIMIT OFFSET ASC DESC INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE INDEX VIEW DROP ALTER WITH UNION ALL EXISTS CASE WHEN THEN ELSE END BETWEEN LIKE RETURNING BEGIN COMMIT ROLLBACK PRIMARY KEY REFERENCES DEFAULT".split(" ")),
};

const TYPES = {
  Python: new Set("bool dict float int list object set str tuple".split(" ")),
  Java: new Set("ArrayList Boolean Byte Character Double Float Integer List Long Map Object Set Short String".split(" ")),
  JavaScript: new Set("Array Boolean Date Map Number Object Promise Set String".split(" ")),
  TypeScript: new Set("Array any bigint boolean never number object string symbol unknown void".split(" ")),
  "C#": new Set("bool byte char DateTime decimal double float int List long object short string Task uint ulong var void".split(" ")),
  Bash: new Set(),
  JSON: new Set(),
  SQL: new Set("INT INTEGER BIGINT TEXT VARCHAR BOOLEAN FLOAT DOUBLE DECIMAL NUMERIC DATE TIMESTAMP JSON JSONB".split(" ")),
};

const SHELL_COMMANDS = new Set("curl echo printf git npm node python python3 pip pytest jq cat grep sed awk ls cd pwd mkdir rm cp mv sleep read test find sort head tail".split(" "));

const CONSTANTS = new Set(["False", "None", "True", "false", "null", "true", "undefined", "NaN", "Infinity"]);

function tokenPattern(language) {
  if (language === "Bash") return /(?<comment>(?<!\S)#[^\n]*)|(?<string>'[^']*'|"(?:\\[\s\S]|[^"\\])*")|(?<variable>\$(?:\{[^}\n]+\}|[A-Za-z_][\w]*|[\d?@#*!$-]))|(?<flag>(?<!\S)--?[A-Za-z][\w-]*(?:=[^\s]+)?)|(?<number>\b\d+(?:\.\d+)?\b)|(?<identifier>[A-Za-z_][\w]*)|(?<operator>[|&;<>]+)|(?<punctuation>[{}()\[\]])/g;
  if (language === "JSON") return /(?<comment>\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?<string>"(?:\\.|[^"\\])*")|(?<number>\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(?<identifier>true|false|null)|(?<punctuation>[{}\[\],:])/g;
  if (language === "SQL") return /(?<comment>--[^\n]*|\/\*[\s\S]*?\*\/)|(?<string>'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`)|(?<number>\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(?<identifier>[A-Za-z_][\w$]*)|(?<operator>[-+*/%=&|^!<>~]+)|(?<punctuation>[{}()\[\].,;])/g;
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
  if (groups.variable) return "constant";
  if (groups.flag) return "keyword";
  if (groups.string && language === "JSON" && /^\s*:/.test(source.slice(offset + match[0].length))) return "type";
  if (groups.string) return "string";
  if (groups.number) return "number";
  if (groups.identifier) {
    const word = groups.identifier;
    const normalized = language === "SQL" ? word.toUpperCase() : word;
    if (KEYWORDS[language].has(normalized)) return "keyword";
    if (CONSTANTS.has(word)) return "constant";
    if (TYPES[language].has(normalized)) return "type";
    if (language === "Bash" && SHELL_COMMANDS.has(word)) return "function";
    if (/^\s*\(/.test(source.slice(offset + match[0].length))) return "function";
  }
  if (groups.operator) return "operator";
  if (groups.punctuation) return "punctuation";
  return "";
}

export function highlightCode(source, language) {
  if (!KEYWORDS[language]) return source.split("\n").map(esc);
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
