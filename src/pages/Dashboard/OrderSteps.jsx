import { useCabinetI18n } from '../../context/CabinetI18nContext';

/* Three-step progress for one order: placed → payment → confirmed.
   Failed / cancelled / rejected / refunded end the flow at step 2 and show it in red. */
const BAD = ['failed', 'cancelled', 'rejected', 'refunded'];

export default function OrderSteps({ status }) {
  const { t } = useCabinetI18n();
  const bad = BAD.includes(status);
  const current = status === 'paid' ? 3 : status === 'awaiting_review' ? 2 : 1;
  const labels = [t('Order placed'), t('Payment'), t('Confirmed')];

  return (
    <ol className="bl-steps" aria-label={t('Order progress')}>
      {labels.map((label, i) => {
        const n = i + 1;
        const done = status === 'paid' || (!bad && n < current);
        const active = !bad && n === current && status !== 'paid';
        const isBad = bad && n === 2;
        const cls = ['bl-step', done && 'done', active && 'active', isBad && 'bad'].filter(Boolean).join(' ');
        return <li key={n} className={cls}>{label}</li>;
      })}
    </ol>
  );
}
