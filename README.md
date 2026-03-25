# CSDL - Phone & Accessories Management

Inventory and sales management system for a phone & accessories shop.

## Tech Stack

- **Next.js** (App Router) with TypeScript
- **SQL Server 2022** (Docker) via `mssql` npm package
- **Tailwind CSS**
- **pnpm** package manager

## Setup

### 1. Start SQL Server

```bash
docker compose up -d
```

This starts a SQL Server 2022 container on port 1433.

### 2. Create the database

```bash
docker exec -it csdl-sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'YourStrong!Pass123' -C -Q "CREATE DATABASE csdl"
```

### 3. Run migrations

Open `database/migrations/001_init_schema.sql` in your SQL editor (e.g. VS Code SQL Server extension) and execute it against the `csdl` database.

### 4. Install dependencies

```bash
pnpm install
```

### 5. Set environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` if you changed any defaults.

### 6. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  products/page.tsx       — Product list & create form
  inventory/page.tsx      — Stock view
  sales/new/page.tsx      — Create sales invoice
  api/products/route.ts   — Products API (GET, POST)
  api/inventory/route.ts  — Inventory API (GET)
  api/sales/route.ts      — Sales API (POST)
lib/
  db.ts                   — SQL Server connection pool
  services/products.ts    — Product queries
  services/sales.ts       — Invoice logic
database/
  migrations/001_init_schema.sql — Initial schema (13 tables)
docker-compose.yml        — SQL Server 2022 container
```
