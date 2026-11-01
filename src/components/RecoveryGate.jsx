import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import PasswordResetFlow from './PasswordResetFlow';

/** The link in the "reset your password" email signs the person in with a recovery session: ask for the new password right away. */
export default function RecoveryGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') setOpen(true); });
    return () => { if (data && data.subscription) data.subscription.unsubscribe(); };
  }, []);
  return <PasswordResetFlow open={open} initialStep="new" onClose={() => setOpen(false)} />;
}
