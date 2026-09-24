import subprocess
import sys

from .api import SagadeckError, engine_path, node_path


def main() -> int:
    try:
        cmd = [node_path(), str(engine_path()), *sys.argv[1:]]
    except SagadeckError as e:
        print(f"✗ {e}", file=sys.stderr)
        return 1
    try:
        return subprocess.call(cmd)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
