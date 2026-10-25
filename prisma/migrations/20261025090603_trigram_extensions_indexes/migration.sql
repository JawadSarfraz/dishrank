-- Raw SQL from docs/03 "Raw SQL migration": trigram search needs pg_trgm before the GIN indexes;
-- unaccent backs Restaurant.searchText (lower(unaccent(name))). Both are contrib extensions that
-- Supabase, Homebrew PostgreSQL and the postgres:17 CI image ship.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- The two indexes are also declared in prisma/schema.prisma (type: Gin, ops gin_trgm_ops) with these
-- exact names, so Prisma Migrate sees no drift and never generates a DROP for them.
CREATE INDEX IF NOT EXISTS "restaurants_search_trgm" ON "Restaurant" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "dish_alias_trgm" ON "DishAlias" USING GIN ("alias" gin_trgm_ops);
