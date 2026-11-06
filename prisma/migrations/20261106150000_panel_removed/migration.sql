-- An admin's "panel off" is remembered, so an invite link cannot undo it (docs/07 §7a).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "panelRemovedAt" TIMESTAMP(3);
