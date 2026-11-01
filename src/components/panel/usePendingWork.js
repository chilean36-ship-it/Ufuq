import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import useLiveRefresh from '../../lib/liveRefresh';

/**
 * Work waiting for the teacher across the given group codes:
 *  - tasks:  task submissions with no grade saved yet
 *  - exams:  written-exam submissions handed in but not graded yet
 * Reloaded when the groups change, every 90 s, and when `refresh()` is called. Failures just report 0.
 */
export default function usePendingWork(codes) {
  const key = (codes || []).join(',');
  const [state, setState] = useState({ tasks: 0, exams: 0, loaded: false });

  const refresh = useCallback(async () => {
    const list = key ? key.split(',') : [];
    if (list.length === 0) { setState({ tasks: 0, exams: 0, loaded: true }); return; }
    let tasks = 0, exams = 0;
    try {
      const { data: tk } = await supabase.from('tasks').select('id').in('group_code', list);
      const taskIds = (tk || []).map((x) => x.id);
      if (taskIds.length) {
        const { count } = await supabase.from('task_submissions').select('id', { count: 'exact', head: true }).in('task_id', taskIds).is('graded_at', null);
        tasks = count || 0;
      }
      const { data: ex } = await supabase.from('written_exams').select('id').in('group_code', list);
      const examIds = (ex || []).map((x) => x.id);
      if (examIds.length) {
        const { count } = await supabase.from('written_exam_submissions').select('id', { count: 'exact', head: true }).in('exam_id', examIds).eq('status', 'submitted');
        exams = count || 0;
      }
    } catch (e) { /* leave zeros */ }
    setState((cur) => (cur.tasks === tasks && cur.exams === exams && cur.loaded ? cur : { tasks, exams, loaded: true }));
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);
  useLiveRefresh(refresh);

  return { ...state, refresh };
}
