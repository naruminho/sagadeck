import subprocess
import sys

from .api import SagadeckError, engine_path, node_path
from .llm import command_of, llm_env


def main() -> int:
    try:
        cmd = [node_path(), str(engine_path()), *sys.argv[1:]]
    except SagadeckError as e:
        print(f"✗ {e}", file=sys.stderr)
        return 1
    try:
        with llm_env(command_of(sys.argv[1:])) as env:
            return subprocess.call(cmd, env=env)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
