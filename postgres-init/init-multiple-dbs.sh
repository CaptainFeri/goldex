#!/bin/bash
set -e
set -u

function create_database() {
    local database=$1
    echo "  Creating database '$database'"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        SELECT 'CREATE DATABASE "' || '$database' || '"'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$database')\gexec
EOSQL
}

function ensure_app_role() {
    echo "  Ensuring application role 'goldex_app'"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'goldex_app') THEN
                CREATE ROLE goldex_app LOGIN PASSWORD '$GOLDEX_APP_POSTGRES_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
            END IF;
        END
        \$\$;
EOSQL
}

function set_database_owner() {
    local database=$1
    echo "  Setting owner of '$database' to goldex_app"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        ALTER DATABASE "$database" OWNER TO goldex_app;
EOSQL
}

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
    echo "Creating additional databases: $POSTGRES_MULTIPLE_DATABASES"
    for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
        create_database "$db"
    done
    echo "Database creation complete!"
fi

ensure_app_role
echo "Setting database owners..."
set_database_owner "$POSTGRES_DB"
if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
    for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
        set_database_owner "$db"
    done
fi
echo "Creating extensions..."
for db in "$POSTGRES_DB" ${POSTGRES_MULTIPLE_DATABASES//,/ }; do
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d "$db" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" >/dev/null
done
echo "Init complete!"
