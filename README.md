# CSDL - Phone & Accessories Management

Inventory and sales management system for a phone & accessories shop.

## Tech Stack

- **Next.js** (App Router) with TypeScript
- **SQL Server 2022** (Docker) via `mssql` npm package
- **Ant Design** UI components
- **Tailwind CSS**
- **pnpm** package manager

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Linux containers mode)

## Setup

### 1. Start SQL Server

```bash
docker compose up -d --build
```

This builds a custom SQL Server 2022 image and automatically:
- Creates the `csdl` database
- Runs all migration files in `database/migrations/` (schema + seed data)

> On first run, it takes ~20 seconds for SQL Server to be ready and migrations to complete.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set environment variables

**Linux / macOS:**
```bash
cp .env.example .env.local
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local` if you changed any defaults.

### 4. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker Commands

| Command | Description |
|---|---|
| `docker compose up -d --build` | Build image & start (auto-runs migrations) |
| `docker compose stop` | Stop container (data is kept) |
| `docker compose up -d` | Restart container (data is kept) |
| `docker compose down` | Remove container (data is kept in volume) |
| `docker compose down -v` | Remove container & data (fresh start) |

## Project Structure

```
app/
  products/page.tsx       — Product list & create form
  inventory/page.tsx      — Stock view
  sales/new/page.tsx      — Create sales invoice
  test/page.tsx           — Component showcase page
  api/products/route.ts   — Products API (GET, POST)
  api/inventory/route.ts  — Inventory API (GET)
  api/sales/route.ts      — Sales API (POST)
components/
  ProductCard.tsx         — Product display card with image, price, tags
  ProductGrid.tsx         — Responsive grid of ProductCards
  VariantSelector.tsx     — Color & storage variant picker
  DataTable.tsx           — Searchable, sortable table
  FormField.tsx           — Form input wrapper (text, number, select, switch, textarea)
  PageHeader.tsx          — Page title with breadcrumbs & action buttons
lib/
  db.ts                   — SQL Server connection pool
  types/                  — TypeScript interfaces for all tables
database/
  Dockerfile              — Custom SQL Server image with auto-migration
  init-db.sh              — Startup script (waits for SQL Server, runs migrations)
  migrations/             — SQL migration files (run in alphabetical order)
docker-compose.yml        — Docker Compose config
```
