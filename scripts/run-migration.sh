#!/bin/bash
# Script to run database migration
# Usage: ./scripts/run-migration.sh [migration_file]

MIGRATION_FILE="${1:-database/migrations/add_skip_messages.sql}"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "📦 Running migration: $MIGRATION_FILE"

# Read database config from .env
if [ -f .env ]; then
    source .env
    DB_HOST="${DB_HOST:-localhost}"
    DB_USER="${DB_USER:-root}"
    DB_PASSWORD="${DB_PASSWORD}"
    DB_NAME="${DB_NAME:-wa_manager}"
    
    if [ -z "$DB_PASSWORD" ]; then
        echo "⚠️  DB_PASSWORD not found in .env, please enter MySQL password:"
        read -s DB_PASSWORD
    fi
    
    echo "🔌 Connecting to MySQL..."
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$MIGRATION_FILE"
    
    if [ $? -eq 0 ]; then
        echo "✅ Migration completed successfully!"
    else
        echo "❌ Migration failed!"
        exit 1
    fi
else
    echo "❌ .env file not found!"
    exit 1
fi

