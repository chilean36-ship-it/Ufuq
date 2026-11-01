# Ufuq — deploy checklist

## 1. Site (Vercel)
`bash
npm install
npm run build        # must finish without errors
`
Push to the repo connected to Vercel (or `vercel --prod`). Env vars: see `.env.example`.

## 2. Cloudflare Workers (once, then only when `workers/` changes)
**ufuq-media** (teacher videos/audio, private, signed links)
`bash
cd workers/ufuq-media
# 1) wrangler.toml → ALLOWED_ORIGINS = "https://<your-domain>,http://localhost:5173"
npx wrangler secret put SIGNING_SECRET      # paste: openssl rand -base64 48
npx wrangler deploy
`
Keep bucket `ufuq-media` PRIVATE (no r2.dev / public domain).
Then make sure `MEDIA_WORKER_URL` in `src/lib/mediaUpload.js` equals the deployed worker URL.

**ufuq-audio-uploader** (lesson audio, now needs a teacher/admin login)
`bash
cd workers/ufuq-audio-uploader
# wrangler.toml → ALLOWED_ORIGINS, and PUBLIC_BASE_URL (copy the value from the current worker in the Cloudflare dashboard)
npx wrangler deploy
`

## 3. Supabase
Already applied to project `ldbthwpikixtykwmvudy`: `group_media`, `group_media_hardening`
(source: `supabase/migrations/group_media.sql`). Nothing to run again.

Applied (2026-10-26): `supabase/migrations/20261026_staff_teacher_groups.sql` — teachers / admins + group linking (main admin only).

Applied (2026-10-26): `20261026b_group_scope_for_ordinary_admins.sql` — ordinary admins / teachers reach only their linked groups at RLS level (teaches_group, profiles policies).

Applied (2026-10-26): `20261026c_group_scope_helpers.sql` — is_group_manager / my_teacher_group_codes / ufuq_is_admin are main-admin-only shortcuts.

APPLIED (verified live on 2026-11-01: staff_demote_missed_student already uses ufuq_pick_level_group): `supabase/migrations/20261119_missed_demote_nearest_lower_group.sql` — the teacher's "Lower level" button (missed deadline) now sends the student to the nearest lower active group, exactly like a failed exam. Run it in the SQL editor, then deploy the site.

## 3b. Hifz (Qur'an recitation checker)
Baza va funksiya `ldbthwpikixtykwmvudy`da tayyor (`supabase/migrations/20261011_hifz.sql`, `supabase/functions/ufuq-hifz-check`).
Deploydan oldin **bir marta**: `public/quran/*.json` ni yasang — `README_HIFZ.md` 1-bo'lim (Tanzil matni, `node scripts/build-quran-json.mjs ...`).
Ixtiyoriy aniqroq dvigatel: `asr-space/` (README_HIFZ 3-4).

## 3c. Exam security — stage 2 (Supabase) — APPLIED 2026-10-26
- Migration `supabase/migrations/20261030_exam_security_stage2.sql` is applied to `ldbthwpikixtykwmvudy` (version `exam_security_stage2_criteria_table` + `exam_security_stage2_revoke_helper_anon`).
  Answer key moved from `written_exam_questions.criteria_text` to the staff-only `written_exam_criteria`; the column is dropped.
- `grade-exam` edge function deployed as v26 (reads the answer key from `written_exam_criteria`).
- Site (frontend) changes in `ExamEditor.jsx` and `WrittenExamsPanel.jsx` must be deployed to Vercel right away: until then the old editor still writes `criteria_text` and will fail to save exams.

## 3d. Security advisor fixes (stage 3) — APPLIED 2026-10-26
`supabase/migrations/20261030b_security_advisor_fixes.sql`: admin helper functions are no longer callable by anonymous visitors; `_audit_block_mutation` has a fixed search_path.
Deliberately left as is: `payments_public_config()` (public checkout config), the SECURITY DEFINER views `individual_sessions_for_student` / `group_slots_for_student` (changing them could hide data from students; review separately).

## 4. Smoke test (5 min)
1. Teacher → Media → upload a small mp4 to ONE group → appears under that group only.
2. Student of that group → Library → Videos → plays (watermark visible). Student of another group → not listed.
3. Landing page: hero sand-letters react to the mouse.
4. Teacher (individual group) → Teaching → Hifz → assign 112-sura 1–4 to a student. Student → My Group → Hifz → record → coloured result appears; teacher opens the task → Approve / Recite again → student sees the verdict.

## 5. CAPTCHA (Cloudflare Turnstile) — serverda yoqish
Brauzer tomonidagi himoya yetarli emas; haqiqiy bloklash Supabase Auth'da yoqiladi. Bir marta:
1. Cloudflare Dashboard → Turnstile → widget yarating. Domen ro'yxatiga saytingiz domenini va `localhost` ni qo'shing.
2. Site key → Vercel/`.env`: `VITE_TURNSTILE_SITE_KEY`. Secret key → **faqat** Supabase Dashboard.
3. Supabase Dashboard → Authentication → Attack Protection → CAPTCHA protection: Turnstile'ni yoqing, secret key'ni kiriting.
   Shu sozlama login, signup, parolni tiklash va parolni o'zgartirish (signInWithPassword) so'rovlarini himoyalaydi.
4. Authentication → Rate Limits: sign-up va sign-in uchun chegaralarni tekshiring.
5. Tekshirish: `.env` da `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (doim o'tadi) bilan kirish ishlashini, `2x00000000000000000000AB` (doim rad) bilan esa xabar chiqishini ko'ring.

## 3e. Exam offline tolerance — stage 1
Supabase: `supabase/migrations/20261031c_exam_offline_guard_fix.sql` (1-bosqich migratsiyasi o'rniga) (adds `written_exam_submissions.paused_seconds` and the RPC `written_exam_offline_credit`). Until it is applied the site still works; outage time just is not credited.
Stage 2 (texnik uzilishlar, frontend): Supabase o'zgarishi kerak emas — `useExamGuard` va `ExamGuardOverlay` yangilandi.
Stage 3 (o'qituvchi: +10 daqiqa va qayta topshirish): migratsiya `supabase/migrations/20261031b_exam_staff_retake_and_time.sql` Supabase'da qo'llangan; frontend `WrittenExamsPanel.jsx` yangilangan.
Stage 4 (zero-bug): `supabase/migrations/20261031c_exam_offline_guard_fix.sql` Supabase'da qo'llangan (1-bosqich vaqt krediti guard trigger tomonidan bekor qilinardi — tuzatildi). Frontend o'zgarishi yo'q.

Applied (2026-10-29): `20261104_levels_12.sql` parts 1-3 (profiles level check 1..12, admin_update_student, written_exams level check, ufuq_create_exam_draft). Part 4 (join-code generator) not re-run.

## Levels 1..14 + exam scoring 150 (Stages 1-2) — APPLIED to live (ldbthwpikixtykwmvudy)
- `20261106_levels_14.sql` — levels 1..14 (profiles, written_exams, admin_update_student, ufuq_create_exam_draft). Frontend: `src/lib/levels.js`.
- `20261107_exam_scoring_150.sql` — Midterm 50 + Final 100 = 150, pass mark 75. Functions: ufuq_pass_mark / ufuq_exam_max / ufuq_exam_points, internal ufuq_level_result(user, level), student RPC my_level_results(). total_score stays a 0..100 percentage; points = percentage scaled to the exam max. Frontend: `src/lib/scoring.js`.
- `20261108_groups_level_column.sql` — groups.level (1..14), used by stage 3.
- `20261109_level_groups_promotion.sql` (Stage 3, APPLIED) — group name = `Level-N` (second group on a level: `Level-N-2`), table level_transitions, auto promotion/demotion trigger on graded midterm/final. Admin > Groups form has a Level selector; existing groups (Group A…) keep their names until a level is chosen.

## AI comments in 4 languages (Nov 2026) — APPLIED 2026-10-29
Migration `20261105_exam_ai_feedback_i18n` applied to `ldbthwpikixtykwmvudy`; `grade-exam` deployed (Supabase version v28, verify_jwt on). The trigger function's EXECUTE is revoked from public/anon/authenticated.
Site changes to deploy to Vercel: exam-room header now shows the Ufuq logo + name (ExamShell.jsx, exam-mode.css); WrittenRunner no longer shows "Saved" when the server refuses a save.
1. Run `supabase/migrations/20261105_exam_ai_feedback_i18n.sql` (adds `written_exam_answers.ai_feedback_i18n` + a trigger that clears stale translations on retake). Safe to run twice.
2. Deploy the function: `supabase functions deploy grade-exam` (v6). Until step 1 is done the function keeps working in the old (Uzbek-only) way.
3. New papers: the AI writes each comment in uz / en / ru / ar in the same request. Old results are translated once, on demand, the first time the student (or teacher) opens them in another language (`{ submission_id, translate_only: true }` — scores are never changed).
4. Dates now follow the cabinet language (`src/lib/dateLocale.js`); extra UZ/RU/AR strings are in `src/i18n/fill-missing.js`.

## Stage 8 - level exams, typed level, groups -> levels (APPLIED to live ldbthwpikixtykwmvudy on 2026-11-01)
- Admin > Students: the number between - and + is an input (type 12 + Enter). `StudentsPage.jsx`, `admin-ui.css`.
- `20261115_admin_level_change_moves_group.sql` (applied as stage8 + stage8c): midterm / final exams belong to a LEVEL - every student of the level
  sees them in any group (one copy per level + kind, `my_level_exams()`), locked until a teacher / admin publishes; teachers of any group of that level
  can grade them; a manual level change moves the student to the group of the new level; `profiles.level_free` = free (test) account.
- `20261115b_old_groups_to_levels.sql` (applied as stage8b): Group A/B/C/D -> Level-8/1/5/9, student levels follow their group. Group E was left as it is.
- Audio uploads: level groups use the key `lvl01..lvl14` (old lettered groups still `a..g`). The Cloudflare worker MUST be redeployed:
  `cd workers/ufuq-audio-uploader && npx wrangler deploy` (without it uploads for "Level-N" groups are refused).
- Free account: `update profiles set level_free = true where id = '<user id>'` (already set for the account "Student").

## Stage 10 - students pass one by one, groups are (letter + level), the deadline closes the group (APPLIED to live ldbthwpikixtykwmvudy on 2026-11-01)
Replaces the stage 9 rule "the group goes up when EVERY student passed". Migrations `20261118_group_series_individual_promotion.sql` and `20261118b_cron_group_deadline_sweep.sql`.
- A group row = one LETTER (A..G, 7 at most) at one LEVEL: `Group A7`, `Group A8`. `(letter, level)` is unique; audio names stay tied to the letter (no worker change).
- A student who passes the level exams (>= 75/150) moves ALONE and at once from A7 to A8 and gets the congratulation window. The first pass creates A8
  (copy of A7: schedule, Zoom, teachers, its own join code) and switches it on; the next passers join the same A8. Nobody waits for the others.
- A student who fails still goes to the nearest LOWER active group (no lower group: he stays and retakes).
- When the deadline of the group's own FINAL exam (published, `written_exams.deadline_at`) passes, the group is switched off (`is_active=false`, `deadline_closed_at`).
  Done by `ufuq_sweep_group_deadlines()`: pg_cron every minute + when the admin opens Groups + when a student opens Home + when a final exam is saved.
  Moving the deadline into the future re-opens a group that was closed by the deadline; switching a group on by hand is respected (`reopened_at`).
- Students still in a closed group see nothing of it (the student app already lists active groups only) and a card "Your group is closed" (`my_closed_groups()`).
  The teacher decides per student in the existing "Missed students" window: open the exam for him only / move down / remove.
  Removing a student no longer switches the group off by itself.
- New group (Admin > Groups > New group): choose a free LETTER (A..G) and a LEVEL; `create_class_group()` makes it atomically (join code + teacher links).
  A letter that already runs a series is refused (`GROUP_LETTER_TAKEN`); the empty Group F / Group G placeholders are taken over, not duplicated.
  The DB also refuses a class group without letter / level. The name ("Group A8") is made by the server.
- Removed: `ufuq_try_advance_group`, the `group_members_left_advance` trigger.
- NOT verified in this environment: `npm run build` (no network). Run it once before deploying to Vercel.

## Nov 2026 redesign: Tasks, Exams, Progress, Settings, Notifications (branch feature/tasks-exams-settings)
- APPLIED (2026-11-01): `supabase/migrations/20261120_exam_roster_keeps_moved_students.sql` (function `staff_exam_roster`): exam results keep the students who passed and moved up, with the group they sit in now.
- Tasks are live for students (the "coming soon" flag is off). Photos / files go to the private `task-submissions` bucket.
- `cleanup-task-files` (Edge Function, deployed by the pipeline) + `.github/workflows/cleanup-task-files.yml`: every Monday files older than 2 months are deleted from that bucket (grades stay). Run the workflow once by hand with "dry run" to see the counts.
- APPLIED (2026-11-01): `supabase/migrations/20261121_group_deadline_uses_series_exams.sql`: the deadline sweep looks for the final exam in the whole series (same letter), otherwise Group A7 is never closed when the level-7 final deadline passes (the exam row sits under Group A8's code).
- APPLIED (2026-11-01): `supabase/migrations/20261122_level1_listening_questions.sql`: data only. Appends the 5 Arabic listening questions (markers `@@audio` / `@@opts` in question_text, correct option in written_exam_criteria) to the end of every Level 1 midterm and final paper (16 papers, all still unpublished). Audio: `public/listening/level1/*.mp3`, made by `scripts/gen-listening-audio.mjs`.
- APPLIED (2026-11-01): `supabase/migrations/20261122_tasks_for_linked_standard_admins.sql` (drops the no_std_admin_* policies on tasks: teachers use standard-admin accounts and could not create tasks).
- APPLIED (2026-11-01): `supabase/migrations/20261123_copy_level7_midterm_to_all_groups.sql` (copies the Level 7 midterm of Group A8 as an unpublished draft into the groups that miss it).
