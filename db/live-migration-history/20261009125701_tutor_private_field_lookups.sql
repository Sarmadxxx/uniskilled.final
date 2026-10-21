-- Exported from the live database migration history (20261009125701 tutor_private_field_lookups).

-- Narrow lookups for private tutor fields, so tutor_profiles' private columns can be locked
-- for every end user. Both run with owner rights but only ever return the caller's own data.

-- The signed-in tutor's own private settings (payout box, meeting-link editor).
create or replace function public.get_my_tutor_private()
returns table (meeting_link text, paypal_email text, payout_method text,
               stripe_account_id text, stripe_account_status text, total_earnings numeric)
language sql stable security definer set search_path = public
as $$
  select tp.meeting_link, tp.paypal_email, tp.payout_method,
         tp.stripe_account_id, tp.stripe_account_status, tp.total_earnings
  from public.tutor_profiles tp
  where tp.user_id = auth.uid();
$$;

-- A confirmed session's meeting link, only for that session's student or tutor.
create or replace function public.get_session_meeting_link(p_session_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select tp.meeting_link
  from public.sessions s
  join public.tutor_profiles tp on tp.user_id = s.tutor_id
  where s.id = p_session_id
    and s.status = 'confirmed'
    and auth.uid() is not null
    and auth.uid() in (s.student_id, s.tutor_id);
$$;

revoke all on function public.get_my_tutor_private() from public, anon;
revoke all on function public.get_session_meeting_link(uuid) from public, anon;
grant execute on function public.get_my_tutor_private() to authenticated;
grant execute on function public.get_session_meeting_link(uuid) to authenticated;
