#!/usr/bin/env bash
# Database backup (docs/10 "Backups and restore"); .github/workflows/db-backup.yml runs it every
# day at 03:00 PKT. pg_dump of the app's schema (public: every DishRank table, with the pg_trgm and
# unaccent extensions) in custom format, checked with pg_restore, encrypted with gpg (symmetric
# AES-256), then decrypted again and compared. Neither the database URL nor the passphrase is ever
# printed. Any failure, or a suspiciously small file, exits non-zero: the workflow run fails and
# GitHub e-mails the owner.
#
#   BACKUP_DATABASE_URL  the database to dump: Supabase's session pooler (DIRECT_URL, port 5432);
#                        an sslmode in it is ignored (see BACKUP_SSLMODE)
#   BACKUP_PASSPHRASE    the gpg passphrase: one line, at least 20 characters
#   PG_BIN_DIR           where pg_dump and pg_restore 17 are (default: found on PATH)
#   BACKUP_MIN_BYTES     the smallest believable backup (default 150000: an empty DishRank
#                        database dumps to about 90 KB, production with its Overture data to more)
#   BACKUP_SSLMODE       libpq sslmode (default verify-full: the server's certificate chain and host
#                        name are checked against BACKUP_CA_FILE; "prefer" only for a plaintext
#                        database on this machine)
#   BACKUP_CA_FILE       the root CA to verify with (default config/supabase-root-2021.crt, the
#                        certificate src/server/db-ssl.ts verifies Supabase with)
#
# Usage: scripts/db-backup.sh <output directory>  → <output directory>/dishrank-<UTC time>.dump.gpg
set -euo pipefail
umask 077

fail() {
  echo "db-backup: $*" >&2
  exit 1
}

out_dir=${1:-}
[[ -n "$out_dir" ]] || fail "usage: scripts/db-backup.sh <output directory>"
url=${BACKUP_DATABASE_URL:-}
passphrase=${BACKUP_PASSPHRASE:-}
min_bytes=${BACKUP_MIN_BYTES:-150000}
[[ -n "$url" ]] || fail "BACKUP_DATABASE_URL is empty (is the PROD_DIRECT_URL secret set?)"
# pg_dump needs a whole session; the transaction pooler (DATABASE_URL) cannot give it one.
if [[ "$url" == *":6543/"* || "$url" == *"pgbouncer="* ]]; then
  fail "BACKUP_DATABASE_URL is the transaction pooler: use the session pooler URL (DIRECT_URL, port 5432)"
fi
[[ ${#passphrase} -ge 20 ]] || fail "BACKUP_PASSPHRASE is missing or shorter than 20 characters"
[[ "$passphrase" != *$'\n'* ]] || fail "BACKUP_PASSPHRASE must be a single line"
[[ "$min_bytes" =~ ^[0-9]+$ ]] || fail "BACKUP_MIN_BYTES must be a whole number"

# TLS (audit 2026-11, A-03): with libpq, sslmode=require encrypts but does not verify the server, so
# anyone between the runner and Supabase could read the dump. The server is verified against
# Supabase's root CA and its host name instead (verify-full), as the app does. An sslmode inside the
# URL would replace PGSSLMODE, so it is removed from the URL first.
sslmode=${BACKUP_SSLMODE:-verify-full}
ca_file=${BACKUP_CA_FILE:-$(cd "$(dirname "$0")/.." && pwd)/config/supabase-root-2021.crt}
case "$sslmode" in
  verify-full | verify-ca)
    [[ -r "$ca_file" ]] || fail "BACKUP_CA_FILE not found: $ca_file"
    export PGSSLROOTCERT=$ca_file
    ;;
  require | prefer | disable | allow) ;;
  *) fail "BACKUP_SSLMODE must be verify-full, verify-ca, require, prefer, allow or disable" ;;
esac
export PGSSLMODE=$sslmode
url=$(printf '%s' "$url" | sed -E 's/([?&])sslmode=[^&]*&?/\1/; s/[?&]$//')

pg_dump=${PG_BIN_DIR:+$PG_BIN_DIR/}pg_dump
pg_restore=${PG_BIN_DIR:+$PG_BIN_DIR/}pg_restore
for tool in "$pg_dump" "$pg_restore"; do
  version=$("$tool" --version 2>/dev/null) || fail "$tool not found (PostgreSQL 17 client tools)"
  [[ "$version" == *") 17."* ]] || fail "$tool is not PostgreSQL 17: $version"
done
command -v gpg >/dev/null || fail "gpg not found"

work=""
gnupg_home=""
cleanup() {
  if [[ -n "$gnupg_home" ]]; then
    GNUPGHOME=$gnupg_home gpgconf --kill gpg-agent >/dev/null 2>&1 || true
    rm -rf "$gnupg_home"
  fi
  if [[ -n "$work" ]]; then rm -rf "$work"; fi
}
trap cleanup EXIT
work=$(mktemp -d)
# A keyring of its own, never the user's. Under /tmp because gpg-agent's socket lives in it and a
# socket path may be only about 100 characters long.
gnupg_home=$(mktemp -d /tmp/dishrank-gnupg.XXXXXX)
export GNUPGHOME=$gnupg_home

name="dishrank-$(date -u +%Y-%m-%dT%H%MZ)"
dump="$work/$name.dump"
encrypted="$work/$name.dump.gpg"

# 1. Dump. Every app table is in public (Prisma); Supabase's own schemas (auth, storage, …) stay
# out, and the two extensions come along so a restore into an empty database works.
# DECISION-PENDING: public only (no Supabase schemas, no Storage photo files); under 150 KB fails.
PGCONNECT_TIMEOUT=30 PGAPPNAME=dishrank-backup "$pg_dump" --dbname="$url" --no-password \
  --format=custom --schema=public --extension=pg_trgm --extension=unaccent \
  --lock-wait-timeout=120s --file="$dump" || fail "pg_dump failed (its message is above)"

# 2. pg_restore must read it, and it must hold the data of the tables the app cannot do without.
toc="$work/toc.txt"
"$pg_restore" --list "$dump" >"$toc" || fail "pg_restore cannot read the dump"
for table in _prisma_migrations User City Area Dish DishAlias Restaurant RestaurantDish Rating; do
  grep -qE "TABLE DATA public $table( |$)" "$toc" || fail "the dump has no data for table $table"
done

# 3. Encrypt: symmetric AES-256 in the classic OpenPGP format (no AEAD) that every gpg 2.x reads,
# uncompressed (the dump is compressed already). Then decrypt it again and compare.
gpg_base=(--batch --quiet --no-tty --pinentry-mode loopback --passphrase-fd 3 --no-symkey-cache)
gpg "${gpg_base[@]}" --rfc4880 --symmetric --cipher-algo AES256 --s2k-mode 3 \
  --s2k-digest-algo SHA512 --s2k-count 65011712 --compress-algo none \
  --output "$encrypted" "$dump" 3<<<"$passphrase" || fail "gpg could not encrypt the dump"
gpg "${gpg_base[@]}" --decrypt --output "$work/check.dump" "$encrypted" 3<<<"$passphrase" ||
  fail "the encrypted file does not decrypt"
cmp -s "$dump" "$work/check.dump" || fail "the decrypted file differs from the dump"

# 4. A backup far smaller than the database has ever been is a failure too.
size=$(wc -c <"$encrypted" | tr -d ' ')
((size >= min_bytes)) || fail "the backup is only $size bytes (at least $min_bytes expected): suspiciously small"

mkdir -p "$out_dir"
mv "$encrypted" "$out_dir/"
tables=$(grep -c "TABLE DATA public " "$toc" || true)
echo "db-backup: $name.dump.gpg, $size bytes, data of $tables tables; encrypted, decrypted and compared"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "name=$name"
    echo "file=$out_dir/$name.dump.gpg"
  } >>"$GITHUB_OUTPUT"
fi
