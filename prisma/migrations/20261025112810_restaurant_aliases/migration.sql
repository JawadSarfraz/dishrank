-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
