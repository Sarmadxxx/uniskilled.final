-- UniSkilled Classroom: private lesson rooms + attendance record.
--
-- 1. classroom_attendance: who was in the lesson room, when, and for how long they were
--    actually connected to the other person. Written only through the two functions below.
-- 2. Realtime authorization: only the booked tutor and student of a paid lesson may use
--    that lesson's private channel (the channel passes the call set-up messages).
-- 3. A server-only switch to open rooms at any time while testing.

create table if not exists public.classroom_attendance (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  role              text not null check (role in ('tutor', 'student')),
  joined_at         timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  connected_seconds integer not null default 0,
  left_at           timestamptz
);
create index if not exists classroom_attendance_session_idx on public.classroom_attendance (session_id, user_id, joined_at desc);

alter table public.classroom_attendance enable row level security;

drop policy if exists "classroom_attendance_read" on public.classroom_attendance;
create policy "classroom_attendance_read" on public.classroom_attendance
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.sessions s
               where s.id = classroom_attendance.session_id
                 and auth.uid() in (s.tutor_id, s.student_id))
  );
-- No insert/update/delete policies: rows are written only by the functions below.

-- Called by the classroom page every 30 seconds while someone is in the room.
-- p_connected = true when they are actually connected to the other person.
create or replace function public.classroom_heartbeat(p_session_id uuid, p_connected boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_row  public.classroom_attendance%rowtype;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  select case when s.tutor_id = v_uid then 'tutor' when s.student_id = v_uid then 'student' end
    into v_role
    from public.sessions s
   where s.id = p_session_id and s.status in ('confirmed', 'completed');
  if v_role is null then raise exception 'Not part of this lesson' using errcode = '42501'; end if;

  select * into v_row from public.classroom_attendance
   where session_id = p_session_id and user_id = v_uid and left_at is null
     and last_seen_at > now() - interval '3 minutes'
   order by joined_at desc limit 1;

  if found then
    update public.classroom_attendance
       set connected_seconds = connected_seconds
             + case when p_connected then least(90, greatest(0, extract(epoch from (now() - v_row.last_seen_at))))::int else 0 end,
           last_seen_at = now()
     where id = v_row.id;
  else
    insert into public.classroom_attendance (session_id, user_id, role) values (p_session_id, v_uid, v_role);
  end if;
end $$;

create or replace function public.classroom_leave(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then return; end if;
  update public.classroom_attendance
     set left_at = now(), last_seen_at = now()
   where session_id = p_session_id and user_id = auth.uid() and left_at is null;
end $$;

revoke all on function public.classroom_heartbeat(uuid, boolean) from public, anon;
revoke all on function public.classroom_leave(uuid) from public, anon;
grant execute on function public.classroom_heartbeat(uuid, boolean) to authenticated;
grant execute on function public.classroom_leave(uuid) to authenticated;

-- Realtime: channel topic is  classroom:<session id>:<room key>
-- Only the booked tutor/student of a paid (or just completed) lesson may listen or send.
drop policy if exists "classroom_participants_receive" on realtime.messages;
create policy "classroom_participants_receive" on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'classroom:%'
    and exists (select 1 from public.sessions s
                where s.id::text = split_part(realtime.topic(), ':', 2)
                  and auth.uid() in (s.tutor_id, s.student_id)
                  and s.status in ('confirmed', 'completed'))
  );

drop policy if exists "classroom_participants_send" on realtime.messages;
create policy "classroom_participants_send" on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'classroom:%'
    and exists (select 1 from public.sessions s
                where s.id::text = split_part(realtime.topic(), ':', 2)
                  and auth.uid() in (s.tutor_id, s.student_id)
                  and s.status in ('confirmed', 'completed'))
  );

-- Testing switch: 'true' lets rooms open at any time (still only for the booked tutor and
-- student of a paid lesson). Set to 'false' before launch.
insert into public.platform_settings (key, value, type, description)
values ('classroom_open_anytime', 'true', 'bool', 'Testing only: lesson rooms open at any time instead of 10 min before to 30 min after the lesson. Set to false before launch.')
on conflict (key) do update set value = excluded.value;
