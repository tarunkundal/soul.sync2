-- Persist in-progress WhatsApp conversation payloads.
--
-- These answers previously lived in a module-level Map, which meant a restart
-- or a second replica lost them while users.conversation_step still claimed the
-- user was mid-flow (e.g. sitting at CONFIRM_PERSON with nothing to confirm).
-- Storing them alongside the step lets both be written in one statement.
--
-- Nullable with no default: NULL means "no conversation in progress", which is
-- the correct state for every existing row, so no backfill is needed.
ALTER TABLE "users" ADD COLUMN "conversation_data" JSONB;
