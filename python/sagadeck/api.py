from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Sequence

ENGINE = Path(__file__).resolve().parent / "engine"
MIN_NODE = (18, 0)


class SagadeckError(RuntimeError):
    pass


def engine_path() -> Path:
    """Caminho do motor JavaScript empacotado."""
    entry = ENGINE / "sagadeck.mjs"
    if not entry.exists():
        raise SagadeckError(
            "Motor não encontrado em %s. Em um clone do repositório, rode antes: npm install && npm run bundle" % entry
        )
    return entry


def node_path() -> str:
    """Localiza o Node.js (>= 18). Pode ser forçado com a variável SAGADECK_NODE."""
    node = os.environ.get("SAGADECK_NODE") or shutil.which("node")
    if not node:
        raise SagadeckError(
            "O sagadeck precisa do Node.js 18+ instalado (https://nodejs.org) "
            "e de Chrome ou Edge para exportar PPTX/PDF."
        )
    out = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip()
    m = re.match(r"v(\d+)\.(\d+)", out)
    if not m or (int(m.group(1)), int(m.group(2))) < MIN_NODE:
        raise SagadeckError(f"Node.js {out or '?'} é antigo demais; o sagadeck precisa do 18 ou mais novo.")
    return node


def run(command: str, *args: str, out: str | os.PathLike | None = None, check: bool = True,
        capture: bool = False, extra: Sequence[str] = ()) -> subprocess.CompletedProcess:
    """Executa um comando do sagadeck: build, check, shots, pptx, pdf, roteiro, all, themes, icons, ref, skill…"""
    cmd = [node_path(), str(engine_path()), command, *map(str, args), *extra]
    if out is not None:
        cmd.append(f"--out={out}")
    proc = subprocess.run(cmd, capture_output=capture, text=True, encoding="utf-8" if capture else None)
    if check and proc.returncode != 0:
        raise SagadeckError(f"sagadeck {command} falhou (código {proc.returncode})" + (f":\n{proc.stderr}" if capture else ""))
    return proc


def build(deck: str | os.PathLike, out=None) -> Path:
    """Gera o .html do deck e devolve o caminho."""
    run("build", str(deck), out=out)
    d = Path(deck)
    return Path(out or d.parent) / (d.stem + ".html")


def check(deck: str | os.PathLike, out=None) -> str:
    """Roda o fiscal de layout e devolve o relatório em texto (útil para um agente corrigir o YAML)."""
    return run("check", str(deck), out=out, capture=True, check=False).stdout


def export(deck: str | os.PathLike, out=None, native_charts: bool = False) -> dict:
    """Gera html, pptx, pdf e roteiro. Devolve os caminhos."""
    run("all", str(deck), out=out, extra=["--native-charts"] if native_charts else [])
    d = Path(deck)
    base = Path(out or d.parent) / d.stem
    return {k: Path(str(base) + ext) for k, ext in
            {"html": ".html", "pptx": ".pptx", "pdf": ".pdf", "roteiro": " - roteiro.pdf"}.items()}


def reference() -> str:
    """Referência completa do formato YAML (Markdown) — ideal para colocar no contexto de um LLM."""
    return (ENGINE / "docs" / "REFERENCIA.md").read_text(encoding="utf-8")


def skill() -> str:
    """Instruções para agentes de IA gerarem decks com o sagadeck (formato SKILL.md)."""
    return (ENGINE / "docs" / "SKILL.md").read_text(encoding="utf-8")
