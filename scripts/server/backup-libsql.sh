#!/usr/bin/env bash
set -euo pipefail

base="$HOME/services/geomodi-libsql"
backup_dir="$base/backups"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
archive="$backup_dir/geomodi-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
temporary="$archive.tmp"

restart_service() {
  systemctl --user start geomodi-libsql.service
}
trap restart_service EXIT

# Copy the complete database directory while the writer is stopped so WAL files
# and the main database belong to the same point in time.
systemctl --user stop geomodi-libsql.service
tar -C "$base" -czf "$temporary" data keys
chmod 600 "$temporary"
mv "$temporary" "$archive"
find "$backup_dir" -maxdepth 1 -type f -name 'geomodi-*.tar.gz' -mtime +14 -delete
echo "Backup created: $archive"
