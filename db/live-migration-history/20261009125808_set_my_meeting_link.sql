-- Exported from the live database migration history (20261009125808 set_my_meeting_link).

-- Save the signed-in tutor's own meeting link (Zoom/Meet/Teams). Replaces a direct upsert that
-- would need read access to the private meeting_link column.
create or replace function public.set_my_meeting_link(p_link text)
returns text
language plpgsql security definer set search_path = public
as $$
declare v text := nullif(trim(coalesce(p_link, '')), '');
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if v is not null and (v !~* '^https://[^\s/$.?#][^\s]*$' or length(v) > 500) then
    raise exception 'Enter a full link starting with https://' using errcode = '22023';
  end if;
  insert into public.tutor_profiles (user_id, meeting_link) values (auth.uid(), v)
  on conflict (user_id) do update set meeting_link = excluded.meeting_link;
  return v;
end $$;
revoke all on function public.set_my_meeting_link(text) from public, anon;
grant execute on function public.set_my_meeting_link(text) to authenticated;
