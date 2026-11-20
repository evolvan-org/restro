-- Supports periodic deletion of expired auth tokens.
CREATE INDEX "user_tokens_expires_at_idx" ON "user_tokens"("expires_at");
