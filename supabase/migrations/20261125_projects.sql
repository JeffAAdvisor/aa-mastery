-- AA Team projects: the form and board that replace Monday.com's
-- "Projects Form & Board" (ataandeadvisors.monday.com/boards/5156273947).
--
-- Pages: /projects (the Project Details form) and /projects/board.
--
-- Unlike the tactical boards these pages need an AA Mastery login. Rows name
-- clients, law firms, opposing parties and agency contacts, so nothing here
-- is readable with the anon key:
--   * any signed-in member can file the form (lands in the incoming group)
--     and read back the projects they filed;
--   * leadership (public.is_leadership(), the same gate as timesheets and
--     payments) reads, edits, moves and deletes everything.
--
-- The Monday data is NOT in this file: the repo is public. It is generated
-- into supabase/private/projects_import.sql (gitignored) by
-- tools/build_projects_import.py. Run this migration first, then that file.

create table if not exists public.projects (
  id                  uuid primary key default gen_random_uuid(),
  monday_id           text unique,
  board_group         text not null default 'Incoming responses/In Progress'
                      check (board_group in (
                        'Incoming responses/In Progress',
                        'Upcoming Projects',
                        'Paused',
                        'Completed Projects',
                        'Irregular (On & Off Projects)',
                        'Removed from the Project',
                        'Rejected Projects')),
  -- New rows sort to the bottom of their group, as on Monday.
  sort_order          double precision not null default extract(epoch from now()),

  item_name           text not null check (length(trim(item_name)) between 1 and 200),
  agency              text,
  coder_count         numeric,
  project_name        text,
  coders              text,
  supervisor          text,
  litigation_type     text,
  start_date          date,
  end_date            date,
  status              text,
  languages           text,
  remote_desktop      text,
  review_platform     text,
  company_represented text,
  firm_represented    text,
  opposing_company    text,
  opposing_firm       text,
  case_room_hours     text,
  weekend_allowed     text,
  max_hours_day       numeric,
  max_hours_week      numeric,
  proposed_length     text,
  about               text,
  promoted_qc         text,
  promoted_tl         text,
  skills              text,
  project_managers    text,
  team_leads          text,
  qcs                 text,
  other_contacts      text,
  pace                text,
  protocol_uploaded   text,
  it_contact          text,
  notes               text,
  contact_email       text,

  submitted_by        uuid default auth.uid() references auth.users(id) on delete set null,
  submitted_name      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Long free text is capped at the form's 2,000 characters (with headroom
  -- for edits); everything else at 1,000.
  check (length(about) <= 4000 and length(other_contacts) <= 4000 and length(notes) <= 4000),
  check (greatest(length(agency), length(project_name), length(coders), length(supervisor),
                  length(litigation_type), length(status), length(languages), length(remote_desktop),
                  length(review_platform), length(company_represented), length(firm_represented),
                  length(opposing_company), length(opposing_firm), length(case_room_hours),
                  length(weekend_allowed), length(proposed_length), length(promoted_qc),
                  length(promoted_tl), length(skills), length(project_managers), length(team_leads),
                  length(qcs), length(pace), length(protocol_uploaded), length(it_contact),
                  length(contact_email), length(submitted_name)) <= 1000)
);

create index if not exists projects_group_idx on public.projects (board_group, sort_order);
create index if not exists projects_submitter_idx on public.projects (submitted_by);

comment on table public.projects is
  'AA Team project board (/projects, /projects/board). Login required; leadership sees all, members see what they filed.';
comment on column public.projects.board_group is 'Board group the item sits in (Monday group names).';
comment on column public.projects.coder_count is 'Monday "Numbers" column: how many coders are on the project.';
comment on column public.projects.monday_id   is 'Monday.com item id for rows imported from the old board; null for new rows.';

-- Keep updated_at honest and the filer fixed on edits.
create or replace function public.projects_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at   := now();
  new.created_at   := old.created_at;
  new.submitted_by := old.submitted_by;
  return new;
end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.projects_touch();

alter table public.projects enable row level security;

revoke all on public.projects from anon;
grant select, insert, update, delete on public.projects to authenticated;

drop policy if exists projects_leadership_all on public.projects;
drop policy if exists projects_member_read    on public.projects;
drop policy if exists projects_member_file    on public.projects;

create policy projects_leadership_all on public.projects for all to authenticated
  using (public.is_leadership()) with check (public.is_leadership());

create policy projects_member_read on public.projects for select to authenticated
  using (submitted_by = auth.uid());

-- Members may only file a new incoming project as themselves.
create policy projects_member_file on public.projects for insert to authenticated
  with check (submitted_by = auth.uid()
              and board_group = 'Incoming responses/In Progress'
              and monday_id is null);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — expect 3 policies: projects_leadership_all (ALL),
-- projects_member_file (INSERT), projects_member_read (SELECT). No anon grant.
-- ═══════════════════════════════════════════════════════════════════════════
select policyname, cmd, roles::text from pg_policies where tablename = 'projects' order by policyname;
select grantee, string_agg(privilege_type, ', ' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'projects' and grantee in ('anon', 'authenticated')
 group by grantee;
