#!/usr/bin/env bash
set -euo pipefail

IMAGE="postgres:17"
FORMAT="custom"
INPUT=""
TARGET_URL=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS] <target-url> <input-file>

Import a PostgreSQL dump into a database using Docker.

Arguments:
  target-url    PostgreSQL connection string (e.g. postgres://user:pass@host:5432/dbname)
  input-file    Path to the dump file (or - for stdin)

Options:
  --format, -F  Dump format: custom (default), plain, tar
  -h, --help    Show this help message

Notes:
  For custom/tar formats, pg_restore is used with --clean --if-exists.
  For plain format, psql is used.
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format|-F) FORMAT="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $1" >&2; exit 1 ;;
    *)
      if [[ -z "$TARGET_URL" ]]; then
        TARGET_URL="$1"
      elif [[ -z "$INPUT" ]]; then
        INPUT="$1"
      else
        echo "Error: unexpected argument '$1'" >&2; exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$TARGET_URL" ]]; then
  echo "Error: target connection string is required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi

if [[ -z "$INPUT" ]]; then
  echo "Error: input file is required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi

case "$FORMAT" in
  custom|c|tar|t)
    if [[ "$INPUT" == "-" ]]; then
      docker run --rm -i --network host "$IMAGE" pg_restore --clean --if-exists -d "$TARGET_URL"
    else
      docker run --rm -i --network host "$IMAGE" pg_restore --clean --if-exists -d "$TARGET_URL" < "$INPUT"
    fi
    ;;
  plain|p)
    if [[ "$INPUT" == "-" ]]; then
      docker run --rm -i --network host "$IMAGE" psql "$TARGET_URL"
    else
      docker run --rm -i --network host "$IMAGE" psql "$TARGET_URL" < "$INPUT"
    fi
    ;;
  *)
    echo "Error: unknown format '$FORMAT'. Use custom, plain, or tar." >&2
    exit 1
    ;;
esac

echo "Import complete (format: $FORMAT)" >&2
