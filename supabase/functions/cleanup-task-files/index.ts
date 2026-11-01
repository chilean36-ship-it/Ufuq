// ============================================================
// Ufuq — cleanup-task-files
// Homework photos / files live in the private "task-submissions" bucket (folder = the student's id). Files older than
// KEEP_DAYS (2 months) are deleted automatically; the grade and the teacher's comment stay in task_submissions.
//   1) every submission older than the cutoff: its file is removed from the bucket and file_path is set to ''
//      (the app shows "the file was removed after 2 months")
//   2) a sweep over the bucket removes any other old object (e.g. the previous file when a student replaced it)
// Not called by browsers. The GitHub Action .github/workflows/cleanup-task-files.yml runs it every week: it sets the
// CRON_SECRET secret to a fresh random value and sends it in the x-cron-secret header (verify_jwt is off for this function,
// see supabase/config.toml). POST ?dry=1 only counts, nothing is deleted.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "task-submissions";
const KEEP_DAYS = 60;
const PAGE = 100;
const MAX_FILES = 5000;   // per run; the next weekly run continues

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST expected" }, 405);
  const secret = Deno.env.get("CRON_SECRET") || "";
  const given = req.headers.get("x-cron-secret") || "";
  if (!secret || !given || !safeEqual(secret, given)) return json({ error: "Unauthorized" }, 401);

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  const stats = { dry, cutoff: cutoff.toISOString(), rows: 0, removedFiles: 0, orphanFiles: 0, errors: [] as string[] };

  let withExtra = true;   // false once we learn that the extra_files column does not exist yet
  // 1) submissions older than the cutoff
  for (let guard = 0; guard < 50; guard++) {
    let res = await db.from("task_submissions").select(withExtra ? "id, file_path, extra_files" : "id, file_path").lt("submitted_at", cutoff.toISOString()).neq("file_path", "").limit(PAGE);
    if (res.error && /extra_files/i.test(res.error.message || "")) {   // the column for extra photos does not exist yet (migration 20261125)
      withExtra = false;
      res = await db.from("task_submissions").select("id, file_path").lt("submitted_at", cutoff.toISOString()).neq("file_path", "").limit(PAGE);
    }
    const { data, error } = res;
    if (error) { stats.errors.push("rows: " + error.message); break; }
    if (!data || data.length === 0) break;
    stats.rows += data.length;
    if (dry) break;
    const paths = data.flatMap((r: { file_path: string; extra_files?: Array<{ path?: string }> }) => [r.file_path, ...((Array.isArray(r.extra_files) ? r.extra_files : []).map((x) => String((x && x.path) || "")).filter(Boolean))]);
    const rm = await db.storage.from(BUCKET).remove(paths);
    if (rm.error) { stats.errors.push("remove: " + rm.error.message); break; }
    stats.removedFiles += (rm.data || []).length;
    const { error: upErr } = await db.from("task_submissions").update(withExtra ? { file_path: "", extra_files: [] } : { file_path: "" }).in("id", data.map((r: { id: string }) => r.id));
    if (upErr) { stats.errors.push("update: " + upErr.message); break; }
    if (stats.removedFiles >= MAX_FILES) break;
  }

  // 2) leftovers: any object older than the cutoff (folders are the student ids)
  try {
    const folders: string[] = [];
    for (let off = 0; ; off += PAGE) {
      const { data, error } = await db.storage.from(BUCKET).list("", { limit: PAGE, offset: off });
      if (error) { stats.errors.push("list root: " + error.message); break; }
      if (!data || data.length === 0) break;
      data.forEach((it: { id: string | null; name: string }) => { if (!it.id) folders.push(it.name); });
      if (data.length < PAGE) break;
    }
    for (const folder of folders) {
      for (let off = 0; ; off += PAGE) {
        const { data, error } = await db.storage.from(BUCKET).list(folder, { limit: PAGE, offset: off });
        if (error) { stats.errors.push("list " + folder + ": " + error.message); break; }
        if (!data || data.length === 0) break;
        const old = data
          .filter((it: { id: string | null; created_at?: string }) => it.id && it.created_at && new Date(it.created_at) < cutoff)
          .map((it: { name: string }) => folder + "/" + it.name);
        if (old.length) {
          stats.orphanFiles += old.length;
          if (!dry) {
            const rm = await db.storage.from(BUCKET).remove(old);
            if (rm.error) stats.errors.push("remove " + folder + ": " + rm.error.message);
          }
        }
        if (data.length < PAGE) break;
        if (stats.orphanFiles >= MAX_FILES) break;
      }
    }
  } catch (e) {
    stats.errors.push("sweep: " + String(e));
  }

  console.log("cleanup-task-files", JSON.stringify(stats));
  return json({ ok: stats.errors.length === 0, ...stats });
});
