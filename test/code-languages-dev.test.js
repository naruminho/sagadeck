import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { inferCodeLanguage, normalizeCodeLanguage, resolveCodeLanguage } from "../src/code-language.js";
import { highlightCode } from "../src/code-highlight.js";
import { buildHTML } from "../src/build.js";

test("linguagens técnicas: extensões e aliases de Bash/cURL, JSON e SQL", () => {
  for (const [file, language] of [["pedido.sh", "Bash"], ["script.bash", "Bash"], ["resposta.json", "JSON"], ["dados.jsonc", "JSON"], ["consulta.sql", "SQL"]]) {
    assert.equal(inferCodeLanguage(file), language);
  }
  for (const [alias, language] of [["curl", "Bash"], ["shell", "Bash"], ["sh", "Bash"], ["bash", "Bash"], ["json", "JSON"], ["sql", "SQL"]]) {
    assert.equal(normalizeCodeLanguage(alias), language);
  }
  assert.equal(resolveCodeLanguage("", "pedido.sh"), "Bash");
  assert.equal(resolveCodeLanguage("SQL", "exemplo.py"), "SQL");
});

test("Bash/cURL: opções, variáveis e comentários com URL e texto preservados", () => {
  const code = ['curl --request POST https://api.example.test/v1#parte \\', '  -H "Authorization: Bearer $API_TOKEN" \\', '  --data \'{"nome":"<script>"}\'', '# comentário', 'echo $API_TOKEN'].join("\n");
  const html = highlightCode(code, "Bash").join("\n");
  assert.match(html, /tok-function[^>]*>curl/);
  assert.match(html, /tok-keyword[^>]*>--request/);
  assert.match(html, /tok-constant[^>]*>\$API_TOKEN/);
  assert.match(html, /tok-comment[^>]*># comentário/);
  assert.doesNotMatch(html, /tok-comment[^>]*>.*v1/);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal(highlightCode(code, "Bash").length, code.split("\n").length);
});

test("JSON e SQL: chaves, literais, números e comentários reais sem interpretar HTML", () => {
  const json = highlightCode('{"url":"https://example.test/a", "ativo":true, "n":-1.5e2}', "JSON").join("\n");
  assert.match(json, /tok-type[^>]*>&quot;url&quot;/);
  assert.match(json, /tok-constant[^>]*>true/);
  assert.match(json, /tok-number[^>]*>1.5e2/);
  assert.doesNotMatch(json, /tok-comment/);
  const sql = highlightCode("select nome from pedidos where nome = 'O''Brien' -- consulta\nAND total >= 42;", "SQL").join("\n");
  assert.match(sql, /tok-keyword[^>]*>select/);
  assert.match(sql, /tok-string[^>]*>'O''Brien'/);
  assert.match(sql, /tok-comment[^>]*>-- consulta/);
  assert.match(sql, /tok-keyword[^>]*>AND/);
  assert.deepEqual(highlightCode("<script>\nalert(1)", "desconhecida"), ["&lt;script&gt;", "alert(1)"]);
});

test("slides de código e guia aplicam realce técnico offline", () => {
  for (const layout of ["code", "codewalk"]) {
    const out = buildHTML({ slides: [{ layout, title: "Chamada", filename: "pedido.sh", code: "curl --fail https://example.test", steps: [{ title: "Chamar", highlight: [1] }] }] });
    assert.deepEqual(out.warnings, []);
    assert.match(out.html, /tok-function[^>]*>curl/);
    assert.match(out.html, /tok-keyword[^>]*>--fail/);
  }
});
