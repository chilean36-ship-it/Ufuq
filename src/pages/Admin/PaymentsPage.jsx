import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { usePanel } from '../../components/panel/PanelContext';
import PageStyle from '../../components/PageStyle';
import { IC_WALLET } from './payments/paymentsShared';
import { PAY_CSS } from './payments/paymentsStyles';
import OrdersTab from './payments/OrdersTab';
import AccessTab from './payments/AccessTab';
import SettingsTab from './payments/SettingsTab';
import DeadlinesTab from './payments/DeadlinesTab';

/** Admin → Payments: orders & bank-transfer review, who has access, and the payment settings. All writes go through
 *  SECURITY DEFINER RPCs that re-check the caller (see supabase/migrations/20261018_payments.sql). */

export default function PaymentsPage() {
  const { t, toast, isSuper } = usePanel();
  const [tab, setTab] = useState('orders');
  return (
    <section className="page active" id="page-payments">
      <PageStyle css={PAY_CSS} />
      <div className="pay-head">
        <span className="pay-head-icon">{IC_WALLET}</span>
        <div className="pay-head-text"><h2>{t('Payments')}</h2></div>
      </div>
      <div className="pay-tabs" role="tablist">
        {[['orders', 'Orders'], ['access', 'Access'], ['deadlines', 'Deadlines'], ...(isSuper ? [['settings', 'Settings']] : [])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={'pay-tab' + (tab === k ? ' is-active' : '')} onClick={() => setTab(k)}>{t(l)}</button>
        ))}
      </div>
      <div className="pay-pane" key={tab}>
        {tab === 'orders' && <OrdersTab />}
        {tab === 'access' && <AccessTab />}
        {tab === 'deadlines' && <DeadlinesTab />}
        {tab === 'settings' && isSuper && <SettingsTab />}
      </div>
    </section>
  );
}
