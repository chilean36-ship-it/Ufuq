import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Ufuq AI tab: the chat opens straight away; closing it returns to Home. (No landing page in between.) */
export default function AiScreen() {
  const navigate = useNavigate();
  useEffect(() => {
    const open = () => window.dispatchEvent(new Event('ufuq-ai-open'));
    const t0 = setTimeout(open, 60);
    const t1 = setTimeout(open, 400); // the chat chunk may still be loading on the first tap
    const onClosed = () => navigate('/app', { replace: true });
    window.addEventListener('ufuq-ai-closed', onClosed);
    return () => { clearTimeout(t0); clearTimeout(t1); window.removeEventListener('ufuq-ai-closed', onClosed); };
  }, [navigate]);
  return <div className="ua-page" aria-hidden="true" />;
}
