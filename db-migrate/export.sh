#!/usr/bin/env bash
set -euo pipefail

IMAGE="postgres:17"
FORMAT="custom"
OUTPUT=""
SOURCE_URL=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS] <source-url>

Export a PostgreSQL database using pg_dump inside Docker.

Arguments:
  source-url    PostgreSQL connection string (e.g. postgres://user:pass@host:5432/dbname)

Options:
  --format, -F  Dump format: custom (default), plain, tar, directory
  --output, -o  Output file path (default: stdout)
  -h, --help    Show this help message
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format|-F) FORMAT="$2"; shift 2 ;;
    --output|-o) OUTPUT="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $1" >&2; exit 1 ;;
    *) SOURCE_URL="$1"; shift ;;
  esac
done

if [[ -z "$SOURCE_URL" ]]; then
  echo "Error: source connection string is required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi

# Map format names to pg_dump -F codes
case "$FORMAT" in
  custom|c)    FMT_FLAG="c" ;;
  plain|p)     FMT_FLAG="p" ;;
  tar|t)       FMT_FLAG="t" ;;
  directory|d) FMT_FLAG="d" ;;
  *) echo "Error: unknown format '$FORMAT'. Use custom, plain, tar, or directory." >&2; exit 1 ;;
esac

DUMP_CMD=(docker run --rm --network host "$IMAGE" pg_dump -F "$FMT_FLAG" "$SOURCE_URL")

if [[ -n "$OUTPUT" ]]; then
  "${DUMP_CMD[@]}" > "$OUTPUT"
  echo "Exported to $OUTPUT (format: $FORMAT)" >&2
else
  "${DUMP_CMD[@]}"
fi
