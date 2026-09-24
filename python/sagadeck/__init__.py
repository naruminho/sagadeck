"""sagadeck — apresentações a partir de YAML: HTML animado, PowerPoint editável, PDF e roteiro.

O motor é JavaScript (Node 18+) e vem empacotado dentro deste pacote; este módulo só o localiza e chama.

Uso na linha de comando:
    sagadeck all minha-palestra.yaml

Uso em Python (ex.: para uma IDE/agente coordenar):
    import sagadeck
    sagadeck.run("all", "minha-palestra.yaml", out="saida")
    print(sagadeck.reference())      # referência completa do YAML, para passar a um LLM
"""

from .api import run, build, check, autofix, studio, export, reference, skill, engine_path, node_path

__version__ = "1.0.0"
__all__ = ["run", "build", "check", "autofix", "studio", "export", "reference", "skill", "engine_path", "node_path", "__version__"]
