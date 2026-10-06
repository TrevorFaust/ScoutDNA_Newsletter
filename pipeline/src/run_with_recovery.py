"""Run a pipeline command up to 3 times, repairing between attempts.

Exit 0 if any attempt succeeds. Exit 1 only after the third consecutive failure,
which is when GitHub sends the failure email.
"""

import argparse

from .recovery import run_with_recovery


def main() -> None:
    parser = argparse.ArgumentParser(description="Retry a pipeline command after a repair")
    parser.add_argument("--label", required=True, help="Short name used in logs, e.g. weekly compose")
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = list(args.command)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise SystemExit("Pass the command after --, for example: python -m src.run_collect --date 2026-10-06")
    if args.attempts < 1:
        raise SystemExit("--attempts must be at least 1")
    raise SystemExit(run_with_recovery(command, label=args.label, attempts=args.attempts))


if __name__ == "__main__":
    main()
