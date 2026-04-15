#!/usr/bin/env bash
set -euo pipefail

IMAGE="postgres:17"
FORMAT="custom"
SOURCE_URL=""
TARGET_URL=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS] <source-url> <target-url>

Migrate a PostgreSQL database by piping pg_dump directly into pg_restore/psql.

Arguments:
  source-url    Source PostgreSQL connection string
  target-url    Target PostgreSQL connection string

Options:
  --format, -F  Dump format: custom (default), plain, tar
  -h, --help    Show this help message
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format|-F) FORMAT="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $1" >&2; exit 1 ;;
    *)
      if [[ -z "$SOURCE_URL" ]]; then
        SOURCE_URL="$1"
      elif [[ -z "$TARGET_URL" ]]; then
        TARGET_URL="$1"
      else
        echo "Error: unexpected argument '$1'" >&2; exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$SOURCE_URL" ]]; then
  echo "Error: source connection string is required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi

if [[ -z "$TARGET_URL" ]]; then
  echo "Error: target connection string is required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi

# Map format names to pg_dump -F codes
case "$FORMAT" in
  custom|c) FMT_FLAG="c" ;;
  plain|p)  FMT_FLAG="p" ;;
  tar|t)    FMT_FLAG="t" ;;
  *) echo "Error: unknown format '$FORMAT'. Use custom, plain, or tar." >&2; exit 1 ;;
esac

echo "Migrating from source to target (format: $FORMAT)..." >&2

if [[ "$FMT_FLAG" == "p" ]]; then
  docker run --rm --network host "$IMAGE" pg_dump -F "$FMT_FLAG" "$SOURCE_URL" \
    | docker run --rm -i --network host "$IMAGE" psql "$TARGET_URL"
else
  docker run --rm --network host "$IMAGE" pg_dump -F "$FMT_FLAG" "$SOURCE_URL" \
    | docker run --rm -i --network host "$IMAGE" pg_restore --clean --if-exists -d "$TARGET_URL"
fi

echo "Migration complete." >&2
