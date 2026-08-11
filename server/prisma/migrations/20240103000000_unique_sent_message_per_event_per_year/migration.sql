-- Enforce at most one SENT message per important date per calendar year.
--
-- This makes the duplicate-send guard a database invariant instead of
-- application-only logic. Previously the guard lived solely in JS and silently
-- did nothing because important_date_id was never populated on insert.
--
-- Partial predicate notes:
--   * important_date_id IS NOT NULL  -> every pre-existing Messages row has a
--     NULL important_date_id, so all historical data is excluded and this index
--     applies cleanly without a backfill or de-duplication step.
--   * status = 'SENT'                -> FAILED rows must never block a retry.
--
-- date_part('year', sent_at) is IMMUTABLE for `timestamp without time zone`,
-- which is required for use in an index expression.
CREATE UNIQUE INDEX "Messages_important_date_id_sent_year_key"
    ON "Messages" ("important_date_id", (date_part('year', "sent_at")))
    WHERE "important_date_id" IS NOT NULL AND "status" = 'SENT';
