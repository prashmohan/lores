#!/bin/sh
set -e

# Ensure SQLite data directory has correct permissions for lores user
mkdir -p /app/data
chown -R lores:lores /app/data 2>/dev/null || true

# Execute command as unprivileged lores user
exec gosu lores "$@"
