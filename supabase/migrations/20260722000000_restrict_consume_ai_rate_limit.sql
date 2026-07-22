-- The RPC is called by the server with SUPABASE_SERVICE_ROLE_KEY. Remove both
-- inherited and explicit API-role grants while preserving that server-only path.
revoke all on function public.consume_ai_rate_limit(text, integer, integer) from public;
revoke execute on function public.consume_ai_rate_limit(text, integer, integer) from anon, authenticated;

grant execute on function public.consume_ai_rate_limit(text, integer, integer) to service_role;
