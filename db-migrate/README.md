# DB Migrate

PostgreSQL database export, import, and migration scripts using [Docker](https://docs.docker.com/get-docker/). No local `pg_dump` or `pg_restore` installation required. The scripts use the `postgres:17` image, which is pulled automatically on first run.

## Scripts

### export.sh

Dump a PostgreSQL database to a file or stdout.

```sh
# Export to a file (custom format, default)
./export.sh -o backup.dump postgres://user:pass@localhost:5432/mydb

# Export as plain SQL
./export.sh -F plain -o backup.sql postgres://user:pass@localhost:5432/mydb

# Export to stdout (pipe to another tool)
./export.sh postgres://user:pass@localhost:5432/mydb > backup.dump
```

**Options:**

| Flag | Description |
|------|-------------|
| `--format, -F` | Dump format: `custom` (default), `plain`, `tar`, `directory` |
| `--output, -o` | Output file path (default: stdout) |

### import.sh

Restore a dump file into a PostgreSQL database.

```sh
# Import a custom-format dump
./import.sh postgres://user:pass@localhost:5432/mydb backup.dump

# Import a plain SQL dump
./import.sh -F plain postgres://user:pass@localhost:5432/mydb backup.sql

# Import from stdin
cat backup.dump | ./import.sh postgres://user:pass@localhost:5432/mydb -
```

**Options:**

| Flag | Description |
|------|-------------|
| `--format, -F` | Dump format: `custom` (default), `plain`, `tar` |

For custom/tar formats, `pg_restore --clean --if-exists` is used. For plain format, `psql` is used.

### migrate.sh

Export from one database and import into another in a single step.

```sh
# Migrate between two databases
./migrate.sh postgres://user:pass@source:5432/mydb postgres://user:pass@target:5432/mydb

# Migrate using plain SQL format
./migrate.sh -F plain postgres://user:pass@source:5432/mydb postgres://user:pass@target:5432/mydb
```

**Options:**

| Flag | Description |
|------|-------------|
| `--format, -F` | Dump format: `custom` (default), `plain`, `tar` |

## Running via pnpm

```sh
pnpm --filter @powerhousedao/db-migrate export -- -o backup.dump postgres://user:pass@localhost:5432/mydb
pnpm --filter @powerhousedao/db-migrate import -- postgres://user:pass@localhost:5432/mydb backup.dump
pnpm --filter @powerhousedao/db-migrate migrate -- postgres://user:pass@source:5432/mydb postgres://user:pass@target:5432/mydb
```
