#!/bin/bash
# Wait for SQL Server to be ready, then run pending migration files

SQLCMD=/opt/mssql-tools18/bin/sqlcmd
SA_PASSWORD="$MSSQL_SA_PASSWORD"

echo "Waiting for SQL Server to start..."
for i in {1..30}; do
  $SQLCMD -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "SQL Server is ready."
    break
  fi
  if [ $i -eq 30 ]; then
    echo "ERROR: SQL Server failed to start after 60 seconds."
    exit 1
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

# Create migration tracking table
$SQLCMD -S localhost -U sa -P "$SA_PASSWORD" -C -d csdl -Q "
  IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '_MigrationHistory')
    CREATE TABLE _MigrationHistory (
      MigrationFile NVARCHAR(255) PRIMARY KEY,
      AppliedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
"

# Run pending migration files in order
FAILED=0
for f in /migrations/*.sql; do
  FILENAME=$(basename "$f")

  # Skip if already applied
  APPLIED=$($SQLCMD -S localhost -U sa -P "$SA_PASSWORD" -C -d csdl -h -1 -W -Q \
    "SET NOCOUNT ON; SELECT COUNT(*) FROM _MigrationHistory WHERE MigrationFile = '$FILENAME'" 2>/dev/null | head -1 | tr -d '[:space:]')

  if [ "$APPLIED" = "1" ]; then
    echo "SKIP $FILENAME (already applied)"
    continue
  fi

  echo "Running $FILENAME ..."
  OUTPUT=$($SQLCMD -S localhost -U sa -P "$SA_PASSWORD" -C -d csdl -i "$f" 2>&1)
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    echo "ERROR in $FILENAME (exit code $EXIT_CODE):"
    echo "$OUTPUT"
    FAILED=1
    break
  fi

  # Record successful migration
  $SQLCMD -S localhost -U sa -P "$SA_PASSWORD" -C -d csdl -Q \
    "INSERT INTO _MigrationHistory (MigrationFile) VALUES ('$FILENAME')"
  echo "OK $FILENAME"
done

if [ $FAILED -eq 1 ]; then
  echo "MIGRATION FAILED — see error above."
  exit 1
fi

echo "All migrations completed."
