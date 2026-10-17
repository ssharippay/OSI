#!/usr/bin/env sh
set -eu
exec node ops/backup.mjs "${1:-backups/latest}"
