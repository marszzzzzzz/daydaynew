-- 格仔鋪 gridbox schema（由 db/ddl.ts 生成，可重複執行）
-- 可以直接貼入 Supabase SQL Editor 執行

CREATE SCHEMA IF NOT EXISTS gridbox;

CREATE TABLE IF NOT EXISTS gridbox.users (
    id serial PRIMARY KEY,
    "unionId" text NOT NULL UNIQUE,
    name text,
    email text,
    avatar text,
    "passwordHash" text,
    role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','staff','admin')),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "lastSignInAt" timestamptz NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS gridbox.tenants (
    id serial PRIMARY KEY,
    "userId" integer REFERENCES gridbox.users(id) ON DELETE SET NULL,
    name text NOT NULL,
    phone text,
    email text,
    note text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS gridbox.grids (
    id serial PRIMARY KEY,
    code text NOT NULL UNIQUE,
    size text NOT NULL DEFAULT 'M' CHECK (size IN ('M','L')),
    "monthlyRent" numeric(12,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant','occupied','reserved')),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS grids_status_idx ON gridbox.grids (status);

CREATE TABLE IF NOT EXISTS gridbox.leases (
    id serial PRIMARY KEY,
    "gridId" integer NOT NULL REFERENCES gridbox.grids(id),
    "tenantId" integer NOT NULL REFERENCES gridbox.tenants(id),
    "startDate" text NOT NULL,
    "endDate" text NOT NULL,
    "rentFreeDays" integer NOT NULL DEFAULT 0,
    "monthlyRent" numeric(12,2) NOT NULL,
    deposit numeric(12,2) NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
    note text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS leases_grid_idx ON gridbox.leases ("gridId");

CREATE INDEX IF NOT EXISTS leases_tenant_idx ON gridbox.leases ("tenantId");

CREATE TABLE IF NOT EXISTS gridbox.sales (
    id serial PRIMARY KEY,
    "gridId" integer REFERENCES gridbox.grids(id),
    "tenantId" integer REFERENCES gridbox.tenants(id),
    "saleDate" text NOT NULL,
    "saleTime" text,
    "productName" text NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    "unitPrice" numeric(12,2) NOT NULL,
    "totalAmount" numeric(12,2) NOT NULL,
    note text,
    "createdBy" integer REFERENCES gridbox.users(id) ON DELETE SET NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS sales_date_idx ON gridbox.sales ("saleDate");

CREATE INDEX IF NOT EXISTS sales_grid_idx ON gridbox.sales ("gridId");

CREATE INDEX IF NOT EXISTS sales_tenant_idx ON gridbox.sales ("tenantId");

CREATE TABLE IF NOT EXISTS gridbox.rent_records (
    id serial PRIMARY KEY,
    "leaseId" integer NOT NULL REFERENCES gridbox.leases(id),
    "gridId" integer NOT NULL REFERENCES gridbox.grids(id),
    "tenantId" integer NOT NULL REFERENCES gridbox.tenants(id),
    month text NOT NULL,
    type text NOT NULL CHECK (type IN ('rent','deposit')),
    amount numeric(12,2) NOT NULL,
    status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid')),
    "paidAt" text,
    note text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS rent_month_idx ON gridbox.rent_records (month);

CREATE INDEX IF NOT EXISTS rent_lease_idx ON gridbox.rent_records ("leaseId");

ALTER TABLE gridbox.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE gridbox.tenants ENABLE ROW LEVEL SECURITY;

ALTER TABLE gridbox.grids ENABLE ROW LEVEL SECURITY;

ALTER TABLE gridbox.leases ENABLE ROW LEVEL SECURITY;

ALTER TABLE gridbox.sales ENABLE ROW LEVEL SECURITY;

ALTER TABLE gridbox.rent_records ENABLE ROW LEVEL SECURITY;

-- 只限 Supabase：確保公開 API 角色（anon / authenticated）完全掂唔到 gridbox
REVOKE ALL ON SCHEMA gridbox FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA gridbox FROM anon, authenticated;
