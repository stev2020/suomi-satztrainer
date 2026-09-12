drop policy if exists "deny browser access to abuse limits" on public.abuse_rate_limits;
create policy "deny browser access to abuse limits"
on public.abuse_rate_limits
for all
to anon, authenticated
using (false)
with check (false);
