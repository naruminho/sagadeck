"""Liga o motor Node ao LLM através do modelrelay, quando ele está instalado.

O motor fala com qualquer endpoint compatível com OpenAI (SAGADECK_LLM_URL). Se o usuário não
definiu um e o `modelrelay` está instalado neste Python, sobe um `modelrelay serve` em segundo
plano (na porta 8765, ou outra livre; só em 127.0.0.1) enquanto o comando roda — a configuração do modelrelay
(~/.modelrelay/config.toml) decide para onde as chamadas vão: OpenRouter, OpenAI, gateway do banco...
"""

from __future__ import annotations

import os
import re
import socket
import sys
import threading
from contextlib import contextmanager
from typing import Iterator, Sequence

# Versão mínima do modelrelay que este sagadeck espera (0.2.0: a tela de modelos com a lista do provedor e o Testar).
# Mudou o modelrelay? Suba aqui e no extra "ia" do pyproject.toml (regra no CLAUDE.md dos dois repositórios).
MIN_MODELRELAY = "0.2.0"


def _version(v: str) -> tuple:
    return tuple(int(n) for n in re.findall(r"\d+", str(v))[:3]) or (0,)


def relay_clone(module_file: str | None) -> str | None:
    """Pasta do clone do modelrelay quando ele roda direto do repositório (pip install -e), senão None.

    Instalação editável: o Python lê o código da pasta do clone, então quem atualiza é o git pull ali.
    Cópia no site-packages (pip install comum) nunca conta, mesmo com um .venv dentro de um repositório.
    """
    if not module_file:
        return None
    pkg = os.path.dirname(os.path.abspath(module_file))
    if any(p in ("site-packages", "dist-packages") for p in pkg.replace("\\", "/").split("/")):
        return None
    parent = os.path.dirname(pkg)
    for root in (parent, os.path.dirname(parent)) if os.path.basename(parent) == "src" else (parent,):
        if os.path.exists(os.path.join(root, ".git")) and os.path.isfile(os.path.join(root, "pyproject.toml")):
            return root
    return None


def outdated_relay(installed: str, module_file: str | None = None) -> str | None:
    """Aviso (ou None) para um modelrelay mais velho que o exigido, com o jeito certo de atualizar."""
    if _version(installed) >= _version(MIN_MODELRELAY):
        return None
    msg = f"Aviso: modelrelay {installed} está desatualizado: este sagadeck precisa do {MIN_MODELRELAY} ou mais novo. "
    clone = relay_clone(module_file)
    if clone:
        return msg + f"Ele roda direto do clone (instalação editável); atualize com git pull na pasta {clone}"
    return msg + f'Atualize com: pip install -U "modelrelay>={MIN_MODELRELAY}"'



# comandos do motor que podem usar o LLM
AI_COMMANDS = {"studio", "web", "ensaio-api", "new", "napkin", "visual", "imagens", "images"}
DEFAULT_PORT = 8765  # porta padrão do `modelrelay serve`, onde o motor procura primeiro


def _port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


@contextmanager
def llm_env(command: str | None, env: dict | None = None) -> Iterator[dict]:
    """Ambiente para rodar o motor; com um modelrelay embutido quando fizer sentido."""
    env = dict(os.environ if env is None else env)
    wanted = command in AI_COMMANDS and not env.get("SAGADECK_LLM_URL") and env.get("SAGADECK_NO_RELAY") != "1"
    if not wanted or _port_open(DEFAULT_PORT):  # já tem um `modelrelay serve` rodando: o motor acha sozinho
        yield env
        return
    try:
        import modelrelay
        from modelrelay.server import make_server
    except ImportError:  # sem modelrelay: o motor usa as regras locais
        yield env
        return
    warn = outdated_relay(getattr(modelrelay, "__version__", "0"), getattr(modelrelay, "__file__", None))
    if warn:  # segue funcionando, mas a pessoa fica sabendo o que falta
        print(warn, file=sys.stderr)
    try:
        # na porta padrão, se livre: a tela de configuração (http://127.0.0.1:8765/) fica sempre no mesmo endereço
        try:
            server = make_server(port=DEFAULT_PORT)
        except OSError:
            server = make_server(port=0)
    except Exception as e:  # config inválida: segue sem LLM, mas avisa
        print(f"⚠ modelrelay instalado, mas não consegui iniciar: {e}", file=sys.stderr)
        yield env
        return
    thread = threading.Thread(target=server.serve_forever, name="modelrelay", daemon=True)
    thread.start()
    env["SAGADECK_LLM_URL"] = server.url
    try:
        yield env
    finally:
        server.shutdown()
        server.server_close()


def command_of(args: Sequence[str]) -> str | None:
    return next((a for a in args if not a.startswith("-")), None)
