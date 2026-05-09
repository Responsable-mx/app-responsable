-- D-145: índice compuesto para rate limit extract-profile
-- COUNT(*) WHERE user_email=X AND role=Y AND created_at>=Z
-- Aditiva — sin CASCADE, sin DROP

create index if not exists idx_chat_requests_ratelimit
  on public.chat_requests (user_email, role, created_at desc);
