#!/bin/bash
# Wait for SQL Server to be ready, then run all migration files

SQLCMD=/opt/mssql-tools18/bin/sqlcmd
SA_PASSWORD="$MSSQL_SA_PASSWORD"

echo "Waiting for SQL Server to start..."
for i in {1..30}; do
  $SQLCMD -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "SQL Server is ready."
    break
  fi
  echo "  Not ready yet... ($i/30)"
  sleep 2
done

# Create database if it doesn't exist
echo "Creating database [csdl]..."
$SQLCMD -S localhost -U sa -P "$SA_PASSWORD" -C -Q "
  IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'csdl')
    CREATE DATABASE csdl;
"

# Run migration files in order
for f in /migrations/*.sql; do
  echo "Running $f ..."
  $SQLCMD -S localhost -U sa -P "$SA_PASSWORD" -C -d csdl -i "$f"
done

echo "All migrations completed."
