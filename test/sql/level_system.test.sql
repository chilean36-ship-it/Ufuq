-- Level system regression test. Run by scripts/test-level-sql.sh on a throw-away Postgres (never on the real project).
-- Every check prints "ok - ..." or stops the run with "FAILED: ...".
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
\o /dev/null

create schema t;
create function t.u(n text) returns uuid language sql immutable as $$ select md5('ufuq-test-' || n)::uuid $$;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create function t.throws(q text, pattern text, msg text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlerrm ~ pattern then raise notice 'ok - %', msg; return; end if;
    raise exception 'FAILED: % (wrong error: %)', msg, sqlerrm;
  end;
  raise exception 'FAILED: % (no error was raised)', msg;
end $$;
-- sign in as a test user ('' = the server itself: triggers, cron, service role)
create function t.login(n text) returns void language sql as $$ select set_config('test.uid', case when n = '' then '' else t.u(n)::text end, false) $$;
create function t.mk_user(n text, r public.app_role default 'student', tier text default null, free boolean default false, lvl int default 1)
returns uuid language plpgsql as $$
begin
  insert into auth.users (id, email, raw_user_meta_data) values (t.u(n), n || '@test.local', jsonb_build_object('full_name', n));
  insert into public.profiles (id, full_name, role, admin_tier, level_free, level, status) values (t.u(n), n, r, tier, free, lvl, 'active');
  return t.u(n);
end $$;
create function t.code(gname text) returns text language sql stable as $$ select code from public.groups where name = gname $$;
create function t.put(n text, gname text) returns void language sql as $$
  insert into public.group_members (user_id, group_code, name) values (t.u(n), t.code(gname), n) $$;
-- names of the class groups a user sits in ("Group A8" or "Group A8, Group C5")
create function t.groups_of(n text) returns text language sql stable as $$
  select coalesce(string_agg(g.name, ', ' order by g.name), '') from public.group_members m join public.groups g on g.code = m.group_code
   where m.user_id = t.u(n) and g.type = 'class' $$;
create function t.level_of(n text) returns int language sql stable as $$ select level from public.profiles where id = t.u(n) $$;
create function t.active(gname text) returns boolean language sql stable as $$ select is_active from public.groups where name = gname $$;
create function t.mk_exam(gname text, lvl int, kind text, published boolean default true, deadline timestamptz default null) returns uuid language sql as $$
  insert into public.written_exams (group_code, title, level, exam_kind, is_published, deadline_at)
  values (t.code(gname), 'L' || lvl || ' ' || coalesce(kind, 'quiz'), lvl, kind, published, deadline) returning id $$;
-- the teacher approves a paper: a graded submission with a percentage (fires the level trigger exactly like the site does)
create function t.grade(n text, exam uuid, pct int) returns void language plpgsql as $$
begin
  insert into public.written_exam_submissions (exam_id, user_id, status, total_score, submitted_at)
  values (exam, t.u(n), 'graded', pct, clock_timestamp())
  on conflict (exam_id, user_id) do update set status = 'graded', total_score = excluded.total_score, submitted_at = excluded.submitted_at;
end $$;
create function t.last_move(n text) returns public.level_transitions language sql stable as $$
  select * from public.level_transitions where user_id = t.u(n) order by created_at desc, id desc limit 1 $$;

/* ------------------------------------------------------------------ fixture ------------------------------------------------------------------ */
select t.login('');
select t.mk_user('boss', 'admin', 'super');
select t.mk_user('teachA', 'admin', 'standard');      -- teaches the A cohort
select t.mk_user('teachOld', 'admin', 'standard');    -- used to teach it when the level groups were pre-created
select t.mk_user('teachC', 'teacher');
select t.mk_user('free1', 'student', null, true, 9);  -- the owner's test account: sits in every group, is never moved
select t.mk_user('a1', 'student', null, false, 8), t.mk_user('a2', 'student', null, false, 8), t.mk_user('a3', 'student', null, false, 8);
select t.mk_user('c1', 'student', null, false, 5), t.mk_user('c2', 'student', null, false, 5);
select t.mk_user('nogroup', 'student', null, false, 1);

-- The running groups, as on the live project (old codes) ...
insert into public.groups (code, name, schedule, zoom_link, level, letter) values
  ('24861', 'Group A8', 'old schedule', 'https://zoom.us/j/old', 8, 'A'),
  ('68210', 'Group C5', 'C schedule', 'https://zoom.us/j/c', 5, 'C'),
  ('91847', 'Group D9', 'D schedule', 'https://zoom.us/j/d', 9, 'D');
insert into public.groups (code, name, schedule, type) values ('95123', 'Group X', 'slots', 'individual');
insert into public.teacher_groups (teacher_id, group_code) values (t.u('teachOld'), '24861'), (t.u('teachC'), '68210');
-- ... and every level of the letters pre-created switched off (20261128), copying the teachers of that day
do $$ declare n int; begin
  for n in 1..14 loop
    perform public.ufuq_group_for_letter_level('A', n, '24861', false);
    perform public.ufuq_group_for_letter_level('C', n, '68210', false);
    perform public.ufuq_group_for_letter_level('D', n, '91847', false);
  end loop;
end $$;
-- since then: the cohort got a new teacher, a new timetable and a new Zoom link
delete from public.teacher_groups where teacher_id = t.u('teachOld') and group_code = '24861';
insert into public.teacher_groups (teacher_id, group_code) values (t.u('teachA'), '24861');
update public.groups set schedule = 'new schedule', zoom_link = 'https://zoom.us/j/new' where code = '24861';

select t.put('a1', 'Group A8'), t.put('a2', 'Group A8'), t.put('a3', 'Group A8'), t.put('c1', 'Group C5'), t.put('c2', 'Group C5');
insert into public.group_members (user_id, group_code, name) select t.u('free1'), code, 'free1' from public.groups where type = 'class';

select t.ok((select count(*) from public.groups where type = 'class') = 42, 'fixture: 3 letters x 14 levels');
select t.ok((select count(*) from public.groups where is_active and type = 'class') = 3, 'fixture: only A8, C5, D9 run');

/* --------------------------------------------------- the one-time clean-up of the migration --------------------------------------------------- */
-- The migration ran before this file: its clean-up saw no stale links yet (the fixture is built after it). Re-run the same statement.
select t.ok(exists (select 1 from public.teacher_groups where teacher_id = t.u('teachOld') and group_code = t.code('Group A9')),
            'fixture: the old teacher is still linked to the never-used Group A9');
delete from public.teacher_groups tg using public.groups g
 where g.code = tg.group_code and g.type = 'class' and not g.is_active
   and g.reopened_at is null and g.deadline_closed_at is null and g.moved_on_at is null
   and public.ufuq_group_real_students(g.code) = 0
   and not exists (select 1 from public.profiles p where p.id = tg.teacher_id and p.role = 'admin' and coalesce(p.admin_tier, 'super') = 'super');
select t.ok(not exists (select 1 from public.teacher_groups tg join public.groups g on g.code = tg.group_code
                         where tg.teacher_id in (t.u('teachOld'), t.u('teachC')) and not g.is_active),
            'clean-up: ordinary teachers keep no link to a group that never ran');
select t.ok((select count(*) from public.teacher_groups tg join public.groups g on g.code = tg.group_code where tg.teacher_id = t.u('boss') and g.type = 'class') = 42,
            'clean-up: the main admin keeps every group');
-- put one stale link back to prove that switching a level on replaces it with the cohort's current teachers
insert into public.teacher_groups (teacher_id, group_code) values (t.u('teachOld'), t.code('Group A9'));

/* ------------------------------------------------------------------- exams ------------------------------------------------------------------- */
select t.mk_exam('Group A8', 8, 'midterm') as a8_mid \gset
select t.mk_exam('Group A8', 8, 'final') as a8_fin \gset
select t.mk_exam('Group A8', 9, 'midterm') as a9_mid \gset
select t.mk_exam('Group A8', 9, 'final') as a9_fin \gset
select t.mk_exam('Group C5', 5, 'midterm') as c5_mid \gset
select t.mk_exam('Group C5', 5, 'final') as c5_fin \gset
select t.mk_exam('Group C5', 1, 'midterm') as l1_mid \gset
select t.mk_exam('Group C5', 6, 'midterm') as c6_mid \gset
select t.mk_exam('Group C5', 6, 'final') as c6_fin \gset

/* ---------------------------------------------------- 1. who a level exam is for ---------------------------------------------------- */
select t.login('nogroup');
select t.ok(not public.ufuq_exam_open_to_me(:'l1_mid'), 'an account with no class group cannot open a level exam (it is level 1 by default)');
select t.ok((select count(*) from public.my_level_exams()) = 0, 'an account with no class group is offered no level exams');
select t.login('a1');
select t.ok(public.ufuq_exam_open_to_me(:'a8_mid') and not public.ufuq_exam_open_to_me(:'a9_mid') and not public.ufuq_exam_open_to_me(:'c5_mid'),
            'a student opens the exams of his own level only');
select t.ok((select count(*) from public.my_level_exams()) = 2, 'a level-8 student is offered the level-8 midterm and final');
select t.login('boss');
select t.ok((select string_agg(name, ',' order by name) from public.exam_missed_students(:'a8_mid')) = 'a1,a2,a3',
            'did-not-submit list: the students of the level, no test account');
select t.ok((select count(*) from public.exam_missed_students(:'a9_mid')) = 0,
            'did-not-submit list of a level-9 exam stored under Group A8 does not show the level-8 members of Group A8');
select t.ok((select count(*) from public.exam_missed_students(:'l1_mid')) = 0, 'did-not-submit list ignores accounts with no class group');

select t.login('teachA');
select t.ok(public.teaches_written_exam(:'a8_mid'), 'the teacher of Group A8 handles its exams');
select t.ok(not public.teaches_written_exam(:'c5_mid'), 'the teacher of Group A8 does not handle Group C5''s level exam');
select t.login('teachOld');
select t.ok(not public.teaches_written_exam(:'a9_mid') or public.teaches_group(t.code('Group A8')),
            'a link to a switched-off empty group (A9) gives no right over level-9 exams');
select t.ok(not public.ufuq_teaches_level_exam(:'a9_mid'), 'ufuq_teaches_level_exam ignores switched-off empty groups');

/* ------------------------------------------------- 2. pass: the next level opens ------------------------------------------------- */
select t.login('');
select t.grade('a1', :'a8_mid', 80);     -- 40 / 50
select t.ok(t.level_of('a1') = 8 and t.groups_of('a1') = 'Group A8', 'midterm alone decides nothing');
select t.grade('a1', :'a8_fin', 70);     -- 70 / 100 -> 110 >= 75
select t.ok(t.level_of('a1') = 9, 'pass (110/150): level 8 -> 9');
select t.ok(t.groups_of('a1') = 'Group A9', 'pass: the student sits in Group A9 and nowhere else');
select t.ok(t.active('Group A9'), 'pass: the first student who passes switches Group A9 on');
select t.ok((select schedule = 'new schedule' and zoom_link = 'https://zoom.us/j/new' from public.groups where name = 'Group A9'),
            'Group A9 takes over the CURRENT schedule and Zoom link of Group A8, not the ones from the day it was pre-created');
select t.ok(exists (select 1 from public.teacher_groups where teacher_id = t.u('teachA') and group_code = t.code('Group A9'))
            and not exists (select 1 from public.teacher_groups where teacher_id = t.u('teachOld') and group_code = t.code('Group A9'))
            and exists (select 1 from public.teacher_groups where teacher_id = t.u('boss') and group_code = t.code('Group A9')),
            'Group A9 gets the cohort''s current teacher; the stale teacher link is gone; the main admin stays');
select t.ok((select outcome = 'passed' and reason = 'exam' and from_level = 8 and to_level = 9 and total_points = 110
                    and from_group_name = 'Group A8' and to_group_name = 'Group A9' and seen_at is null from t.last_move('a1')),
            'pass: the result window is recorded (110 points, Group A8 -> Group A9)');
select t.ok(t.active('Group A8'), 'Group A8 keeps running while students are still in it');
select t.ok(t.groups_of('free1') like '%Group A8%' and t.level_of('free1') = 9, 'the test account is never moved');

/* ------------------------------------------ 3. fail: the nearest lower RUNNING group ------------------------------------------ */
select t.grade('a2', :'a8_mid', 20);     -- 10
select t.grade('a2', :'a8_fin', 30);     -- 30 -> 40 < 75
select t.ok(t.level_of('a2') = 5 and t.groups_of('a2') = 'Group C5',
            'fail (40/150): no running group on level 7 or 6, so the student joins Group C5 (level 5)');
select t.ok(not t.active('Group A7') and not t.active('Group A6'), 'fail: no switched-off group was switched on for him');
select t.ok((select outcome = 'failed' and reason = 'exam' and from_level = 8 and to_level = 5 and to_group_name = 'Group C5' from t.last_move('a2')),
            'fail: recorded as 8 -> 5, Group C5');
select t.ok(t.active('Group A8'), 'Group A8 still runs: a3 is in it');

/* ------------------------------- 4. the last student leaves: the old level group closes itself ------------------------------- */
select t.grade('a3', :'a8_mid', 100);
select t.grade('a3', :'a8_fin', 100);
select t.ok(t.groups_of('a3') = 'Group A9' and t.level_of('a3') = 9, 'a3 passes into the same Group A9');
select t.ok(not t.active('Group A8'), 'Group A8 switched itself off: its last student left and the cohort runs in Group A9');
select t.ok((select moved_on_at is not null and deadline_closed_at is null from public.groups where name = 'Group A8'), 'Group A8 is marked "moved on"');
select t.ok(t.groups_of('free1') like '%Group A8%', 'the test account in Group A8 did not keep it open');
select t.ok((select count(*) from public.groups where type = 'class' and is_active) = 3, 'running groups now: A9, C5, D9');

/* --------------------------------- 5. fail: own letter first; a closed group is never the target --------------------------------- */
update public.groups set is_active = true where name in ('Group A7', 'Group C7');   -- admin switches both on by hand
select t.put('c2', 'Group C7');   -- make C7 the bigger group... (c2 is moved back below)
delete from public.group_members where user_id = t.u('c2') and group_code = t.code('Group C7');
select t.grade('a1', :'a9_mid', 10);
select t.grade('a1', :'a9_fin', 10);     -- 5 + 10 = 15
select t.ok(t.groups_of('a1') = 'Group A7' and t.level_of('a1') = 7,
            'fail on level 9: Group A8 is closed, so level 7 is the nearest; of Group A7 and Group C7 his own letter wins');
select t.ok(not t.active('Group A8'), 'the closed Group A8 was not re-opened by a failing student');
select t.ok(t.active('Group A9'), 'Group A9 still runs (a3 is in it)');

/* -------------------------------------------- 6. fail with nothing below: stay and retake -------------------------------------------- */
update public.groups set is_active = false where name = 'Group C7';
select t.grade('c1', :'c5_mid', 10);
select t.grade('c1', :'c5_fin', 10);
select t.ok(t.level_of('c1') = 5 and t.groups_of('c1') = 'Group C5', 'fail on the lowest running level: the student stays in his group');
select t.ok((select outcome = 'failed' and from_level = 5 and to_level = 5 and to_group is null from t.last_move('c1')), 'fail-and-stay is recorded as 5 -> 5');
select t.ok((select count(*) from public.written_exam_submissions where user_id = t.u('c1')) = 2, 'his papers stay until he has seen the result');
select t.login('c1');
select public.ack_level_transition((t.last_move('c1')).id);
select t.login('');
select t.ok((select count(*) from public.written_exam_submissions where user_id = t.u('c1')) = 0
            and (select count(*) from public.written_exam_attempt_archive where user_id = t.u('c1')) = 2,
            'after he closes the result window the level-5 exams are open again (old papers archived)');
select t.grade('c1', :'c5_mid', 90);
select t.grade('c1', :'c5_fin', 90);
select t.ok(t.level_of('c1') = 6 and t.groups_of('c1') = 'Group C6' and t.active('Group C6'), 'the retake counts: 5 -> 6, Group C6 opens');
select t.ok(t.active('Group C5'), 'Group C5 still runs (c2 and the demoted a2 are in it)');

/* ----------------------------------------------------- 7. manual level change ----------------------------------------------------- */
select t.login('boss');
select t.throws($$select public.admin_update_student(t.u('c2'), null, 3)$$, 'NO_ACTIVE_GROUP_AT_LEVEL',
                'manual 5 -> 3 is refused: no group runs on level 3');
select t.ok(not t.active('Group C3') and t.level_of('c2') = 5 and t.groups_of('c2') = 'Group C5',
            'the refused change switched nothing on and moved nobody');
select t.throws($$select public.admin_update_student(t.u('c2'), null, 12)$$, 'NO_ACTIVE_GROUP_AT_LEVEL', 'manual 5 -> 12 is refused the same way');
select public.admin_update_student(t.u('c2'), null, 6);
select t.ok(t.level_of('c2') = 6 and t.groups_of('c2') = 'Group C6', 'manual 5 -> 6 (one level up) joins the running Group C6');
select t.ok((select reason = 'manual' and seen_at is not null from t.last_move('c2')), 'a manual change shows no result window to the student');
select public.admin_update_student(t.u('c2'), null, 7);
select t.ok(t.level_of('c2') = 7 and t.groups_of('c2') = 'Group A7',
            'manual 6 -> 7: Group C7 is switched off but Group A7 runs on level 7, so that is where he goes');
select public.admin_update_student(t.u('c2'), null, 9);
select t.ok(t.groups_of('c2') = 'Group A9' and t.level_of('c2') = 9, 'manual 7 -> 9 joins a running level-9 group of his letter');
select public.admin_update_student(t.u('c2'), null, 10);
select t.ok(t.groups_of('c2') = 'Group A10' and t.active('Group A10'), 'manual 9 -> 10: one level up opens the next level of his series');
select public.admin_update_student(t.u('c2'), 'blocked', null);
select t.ok((select status = 'blocked' from public.profiles where id = t.u('c2')) and t.level_of('c2') = 10, 'status alone changes nothing else');
select public.admin_update_student(t.u('free1'), null, 3);
select t.ok(t.level_of('free1') = 3 and t.groups_of('free1') like '%Group A8%', 'a test account: only the number changes, no move');

select t.login('teachA');
select t.throws($$select public.admin_update_student(t.u('c1'), null, 5)$$, 'guruhingizga tegishli emas', 'a teacher cannot change a student of a group he does not teach');
select t.login('a1');
select t.throws($$select public.admin_update_student(t.u('a1'), null, 14)$$, 'Faqat', 'a student cannot change levels');
select t.throws($$select public.admin_move_student_to_group(t.u('a1'), t.code('Group D9'))$$, 'NOT_ALLOWED', 'a student cannot move himself into a group');

/* ----------------------------------- 8. the group table itself cannot be renumbered under students ----------------------------------- */
select t.login('boss');
select t.throws($$update public.groups set level = 11 where name = 'Group D9'$$, 'GROUP_LEVEL_LOCKED|duplicate key', 'a level group cannot be renumbered into an existing level');
select t.put('nogroup', 'Group D9');
update public.profiles set level = 9 where id = t.u('nogroup');
insert into public.groups (code, name, schedule, level, letter) values ('GTESTF1', 'Group F1', 's', 1, 'F');
select t.ok((select count(*) from public.teacher_groups where group_code = 'GTESTF1') = 1
            and exists (select 1 from public.teacher_groups where group_code = 'GTESTF1' and teacher_id = t.u('boss')),
            'a new group is linked to the main admin only, not to every ordinary admin');
select t.mk_user('f1', 'student', null, false, 1);
select t.put('f1', 'Group F1');
select t.throws($$update public.groups set level = 2 where code = 'GTESTF1'$$, 'GROUP_LEVEL_LOCKED', 'renumbering a group that has students is refused');
update public.groups set schedule = 's2', level = 1 where code = 'GTESTF1';
select t.ok((select schedule = 's2' from public.groups where code = 'GTESTF1'), 'saving the same level (the edit form does) still works');

/* ------------------------------- 9. deadline: the group closes with students inside; staff see them ------------------------------- */
select t.login('');
select t.mk_exam('Group D9', 9, 'final', true, now() - interval '1 hour') as d9_fin \gset
select t.ok(not t.active('Group D9') and (select deadline_closed_at is not null from public.groups where name = 'Group D9'),
            'the final-exam deadline passed: Group D9 is closed (saving the exam runs the sweep)');
select t.login('nogroup');
select t.ok((select string_agg(name || ':' || reason, ',') from public.my_closed_groups()) = 'Group D9:deadline', 'the student is told his group closed because of the deadline');
select t.login('boss');
select t.ok((select string_agg(name || ':' || group_name || ':' || reason, ',') from public.staff_stranded_students()) = 'nogroup:Group D9:deadline',
            'staff see the student who sits in the closed group');
select t.login('teachA');
select t.ok((select count(*) from public.staff_stranded_students()) = 0, 'a teacher of another group does not see him');
select t.login('boss');
select t.ok((select string_agg(name, ',') from public.exam_missed_students(:'d9_fin')) = 'nogroup', 'he is on the did-not-submit list of the final');
select public.staff_demote_missed_student(:'d9_fin', t.u('nogroup'));
select t.ok(t.groups_of('nogroup') = 'Group A7' and t.level_of('nogroup') = 7,
            'Lower level: Group A9 runs on HIS level, so the nearest LOWER running group is Group A7');
select t.ok((select reason = 'missed' and outcome = 'failed' and seen_at is null from t.last_move('nogroup')), 'the student gets the "moved down" window');
select t.ok((select count(*) from public.staff_stranded_students()) = 0, 'nobody is stranded any more');
select t.login('nogroup');
select t.ok((select count(*) from public.my_closed_groups()) = 0, 'the closed-group card is gone for him');

/* ----------------------------------- 10. placing a stranded student by hand ----------------------------------- */
select t.login('boss');
update public.groups set is_active = false where name = 'Group A7';     -- admin switches a group off with students inside
select t.ok((select count(*) from public.staff_stranded_students()) = 2, 'switching Group A7 off strands a1 and nogroup, and staff see both');
select t.login('a1');
select t.ok((select string_agg(reason, ',') from public.my_closed_groups()) = 'manual', 'a1 is told his group was closed (by hand, not by a deadline)');
select t.login('boss');
select t.throws($$select public.admin_move_student_to_group(t.u('a1'), t.code('Group A7'))$$, 'GROUP_INACTIVE', 'nobody can be placed into a switched-off group');
select t.throws($$select public.admin_move_student_to_group(t.u('a1'), '95123')$$, 'GROUP_NOT_FOUND', 'a Quran group is not a level group');
select public.admin_move_student_to_group(t.u('a1'), t.code('Group C6'));
select t.ok(t.groups_of('a1') = 'Group C6' and t.level_of('a1') = 6, 'a1 is placed into Group C6 and becomes level 6');
select public.admin_move_student_to_group(t.u('nogroup'), t.code('Group C6'));
select t.ok((select count(*) from public.staff_stranded_students()) = 0, 'both are placed');
select t.ok((select count(*) from public.level_transitions where user_id = t.u('a1') and reason = 'manual' and seen_at is null) = 0, 'placing by hand shows no result window');

/* ---------------------- 11. a late pass after the cohort left the next level: join a running group, do not resurrect ---------------------- */
select t.login('');
-- Group C5: only a2 (demoted earlier) is left; Group C6 holds c1 + a1 + nogroup. Close C6 as "moved on" by moving them to C7.
update public.groups set is_active = true where name = 'Group C7';
select t.login('boss');
select public.admin_update_student(t.u('c1'), null, 7), public.admin_update_student(t.u('a1'), null, 7), public.admin_update_student(t.u('nogroup'), null, 7);
select t.login('');
select t.ok(not t.active('Group C6') and (select moved_on_at is not null from public.groups where name = 'Group C6'), 'Group C6 closed itself when the cohort moved to Group C7');
update public.groups set is_active = true where name = 'Group A6';      -- another cohort runs on level 6
select t.grade('a2', :'c5_mid', 100);
select t.grade('a2', :'c5_fin', 100);
select t.ok(t.groups_of('a2') = 'Group A6' and t.level_of('a2') = 6,
            'late pass 5 -> 6: Group C6 was left behind by its cohort, so he joins the running Group A6');
select t.ok(not t.active('Group C6'), 'the left-behind Group C6 stays closed');
select t.ok(not t.active('Group C5'), 'Group C5 closed itself too: its last student left and Group C7 runs');
-- ... and when no other group runs on that level, the old one is re-opened for him
select t.mk_user('late', 'student', null, false, 5);
update public.groups set is_active = true where name = 'Group C5';
select t.put('late', 'Group C5');
update public.groups set is_active = false where name = 'Group A6';     -- a2 is stranded there, irrelevant here
select t.grade('late', :'c5_mid', 100);
select t.grade('late', :'c5_fin', 100);
select t.ok(t.groups_of('late') = 'Group C6' and t.active('Group C6') and (select moved_on_at is null from public.groups where name = 'Group C6'),
            'late pass with no running level-6 group: Group C6 is re-opened');

/* -------------------------------------- 12. leaving / joining with a code -------------------------------------- */
select t.ok(not t.active('Group C5'), 'Group C5 closed again when "late" left it');
select t.login('late');
delete from public.group_members where user_id = t.u('late') and group_code = t.code('Group C6');   -- the student leaves by himself
select t.login('');
select t.ok(not t.active('Group C6'), 'the last student left Group C6 by himself while Group C7 runs: it closes');
select t.mk_user('solo', 'student', null, false, 1);
select t.put('solo', 'Group F1');
delete from public.group_members where user_id in (t.u('solo'), t.u('f1')) and group_code = 'GTESTF1';
select t.ok(t.active('Group F1'), 'the only running group of a letter stays open when it becomes empty (new students join it)');
delete from public.group_members where user_id = t.u('free1') and group_code = t.code('Group A9');
select t.ok(t.active('Group A9'), 'a test account leaving closes nothing');

-- a student listed in a switched-off group joins a running one with the code: the dead membership is dropped
select t.ok(t.groups_of('a2') = 'Group A6' and not t.active('Group A6'), 'fixture: a2 sits in the switched-off Group A6');
update public.groups set is_active = true where name = 'Group D6';
select t.login('a2');
select count(*) from public.join_group((select code from public.group_access_codes where group_code = t.code('Group D6'))) \gset j_
select t.ok(:j_count = 1 and t.groups_of('a2') = 'Group D6', 'joining Group D6 with its code leaves the switched-off Group A6');
select t.throws($$select * from public.join_group((select code from public.group_access_codes where group_code = t.code('Group C7')))$$, 'ALREADY_IN_GROUP',
                'one Arabic group per student');
select t.login('');

/* ----------------------------------------------- 13. the top level ----------------------------------------------- */
select t.mk_user('top', 'student', null, false, 14);
update public.groups set is_active = true where name = 'Group D14';
select t.put('top', 'Group D14');
select t.mk_exam('Group D14', 14, 'midterm') as l14_mid \gset
select t.mk_exam('Group D14', 14, 'final') as l14_fin \gset
select t.grade('top', :'l14_mid', 100);
select t.grade('top', :'l14_fin', 100);
select t.ok(t.level_of('top') = 14 and t.groups_of('top') = 'Group D14' and (select outcome = 'passed' and from_level = 14 and to_level = 14 from t.last_move('top')),
            'passing level 14: congratulated, stays in his group');

/* ----------------------------------------------- 14. invariants ----------------------------------------------- */
select t.ok(not exists (
  select 1 from public.group_members m join public.groups g on g.code = m.group_code and g.type = 'class'
    join public.profiles p on p.id = m.user_id and p.role = 'student' and not p.level_free
   group by m.user_id having count(*) > 1), 'invariant: no real student sits in two class groups');
select t.ok(not exists (
  select 1 from public.group_members m join public.groups g on g.code = m.group_code and g.type = 'class'
    join public.profiles p on p.id = m.user_id and p.role = 'student' and not p.level_free
   where g.level is distinct from p.level), 'invariant: every student''s level equals the level of his group');
select t.ok((select count(*) from public.staff_group_student_counts()) = 0, 'student counts are for staff only (nobody signed in: nothing)');
select t.login('boss');
select t.ok((select students from public.staff_group_student_counts() where group_code = t.code('Group C7')) = 3, 'real-student count of Group C7 = 3 (the test account is not counted)');
select t.login('');

select t.ok(not has_function_privilege('authenticated', 'public.ufuq_move_student_level(uuid,integer,integer,text,text,numeric,numeric,numeric,text)', 'execute')
        and not has_function_privilege('authenticated', 'public.ufuq_apply_level_result(uuid,integer)', 'execute')
        and not has_function_privilege('authenticated', 'public.ufuq_group_for_letter_level(text,integer,text,boolean)', 'execute')
        and not has_function_privilege('anon', 'public.admin_move_student_to_group(uuid,text)', 'execute')
        and not has_function_privilege('anon', 'public.staff_stranded_students()', 'execute'),
            'the internal level functions cannot be called from the browser');

\o
\echo
\echo ALL LEVEL SYSTEM TESTS PASSED
