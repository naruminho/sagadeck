"""Liga o motor Node ao LLM através do modelrelay, quando ele está instalado.

O motor fala com qualquer endpoint compatível com OpenAI (SAGADECK_LLM_URL). Se o usuário não
definiu um e o `modelrelay` está instalado neste Python, sobe um `modelrelay serve` em segundo
plano (porta livre, só em 127.0.0.1) enquanto o comando roda — a configuração do modelrelay
(~/.modelrelay/config.toml) decide para onde as chamadas vão: OpenRouter, OpenAI, gateway do banco...
"""

from __future__ import annotations

import os
import socket
import sys
import threading
from contextlib import contextmanager
from typing import Iterator, Sequence

# comandos do motor que podem usar o LLM
AI_COMMANDS = {"studio", "web", "new", "napkin", "visual", "imagens", "images"}
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
        from modelrelay.server import make_server
    except ImportError:  # sem modelrelay: o motor usa as regras locais
        yield env
        return
    try:
        server = make_server(port=0)
    except Exception as e:  # config ausente/inválida: segue sem LLM, mas avisa
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
