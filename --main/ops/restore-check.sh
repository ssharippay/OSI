#!/usr/bin/env sh
set -eu
exec node ops/restore-check.mjs "${1:-backups/latest}"
