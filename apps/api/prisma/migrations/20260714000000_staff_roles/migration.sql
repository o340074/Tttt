-- E8: extend the Role enum with the operator/manager staff roles.
-- Postgres requires enum values to be added outside a transaction; Prisma
-- runs each migration file in its own transaction, so we add them here and
-- the ordering ('operator' after 'support', 'manager' before 'admin') keeps
-- the enum readable. New values are additive — existing rows are unaffected.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'operator' AFTER 'support';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'manager' BEFORE 'admin';
