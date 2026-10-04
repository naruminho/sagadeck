import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { snapshotVersion, listVersions, readVersion, diffSlides } from "../src/studio/versions.js";
import { versionRoutes } from "../src/studio/versions.js";

const deck = (dir, slides = [{ layout: "cover", title: "A" }]) => {
  const f = path.join(dir, "d.yaml");
  fs.writeFileSync(f, `title: T\nslides:\n${slides.map((s) => `  - ${JSON.stringify(s)}`).join("\n")}\n`);
  return f;
};

test("versões: fotografa a cada salvamento diferente, mantém 10, lê e compara", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saga-ver-"));
  try {
    const f = deck(dir);
    const first = fs.readFileSync(f, "utf8");
    assert.ok(snapshotVersion(f, first), "primeira foto");
    assert.equal(snapshotVersion(f, first), null, "conteúdo igual não duplica");
    assert.equal(listVersions(f).length, 1);
    assert.equal(readVersion(f, listVersions(f)[0].name), first);
    assert.throws(() => readVersion(f, "../../x.yaml"), /inválida/);
    assert.throws(() => readVersion(f, "sub/x.yaml"), /inválida/);
    assert.throws(() => readVersion(f, "sem.yaml"), /encontrada/);
    // diff por índice
    assert.deepEqual(diffSlides([{ a: 1 }, { b: 2 }], [{ a: 1 }, { b: 3 }, { c: 1 }]), [1, 2]);
    assert.deepEqual(diffSlides([{ a: 1 }], [{ a: 1 }]), []);
    // retenção: 12 fotos viram 10
    for (let i = 0; i < 12; i++) snapshotVersion(f, first + `#${i}\n`);
    assert.equal(listVersions(f).length, 10);
    assert.equal(snapshotVersion(null, "x"), null);
    assert.deepEqual(listVersions(path.join(dir, "vazio", "sumido.yaml")), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("rotas de versão: lista, mostra, restaura com rede de segurança", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saga-verr-"));
  try {
    const f = deck(dir);
    const res = () => { const r = { status: null, body: "" }; r.obj = null; return { r, writeHead(s) { r.status = s; }, end(b) { r.body = b; try { r.obj = JSON.parse(b); } catch {} } }; };
    const W = { file: f };
    const readJSON = async () => ({});
    let r = res();
    assert.equal(await versionRoutes({ req: { method: "GET" }, res: r, pathname: "/api/versions", W, readJSON }), true);
    assert.deepEqual(r.r.obj.versions, []);
    snapshotVersion(f, fs.readFileSync(f, "utf8"));
    r = res();
    await versionRoutes({ req: { method: "GET" }, res: r, pathname: "/api/versions", W, readJSON });
    assert.equal(r.r.obj.versions.length, 1);
    const name = r.r.obj.versions[0].name;
    r = res();
    await versionRoutes({ req: { method: "POST" }, res: r, pathname: "/api/versions/show", W, readJSON: async () => ({ name }) });
    assert.match(r.r.obj.yaml, /title: T/);
    assert.equal(r.r.obj.slides.length, 1);
    r = res();
    await versionRoutes({ req: { method: "POST" }, res: r, pathname: "/api/versions/show", W, readJSON: async () => ({ name: "../x.yaml" }) });
    assert.equal(r.r.status, 400);
    fs.appendFileSync(f, "\n# toque para sujar o atual\n");
    r = res();
    await versionRoutes({ req: { method: "POST" }, res: r, pathname: "/api/versions/restore", W, readJSON: async () => ({ name }) });
    assert.equal(r.r.obj.ok, true);
    assert.equal(listVersions(f).length, 2, "restaurar fotografa o estado atual antes");
    assert.ok(!fs.readFileSync(f, "utf8").includes("toque"), "voltou ao conteúdo da versão");
    assert.equal(await versionRoutes({ req: { method: "GET" }, res: res(), pathname: "/outro", W, readJSON }), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
