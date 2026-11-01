/* Phase 2 — interactive card form. Values live only in this component's state (never stored or sent);
   the real payment is confirmed on the payment partner's secure page. */

export function detectBrand(num) {
  const n = (num || '').replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'mc';
  if (/^(8600|5614)/.test(n)) return 'uzcard';
  if (/^9860/.test(n)) return 'humo';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^(62|81)/.test(n)) return 'unionpay';
  return '';
}
export function formatCardNumber(v) {
  const d = (v || '').replace(/\D/g, '');
  const amex = /^3[47]/.test(d);
  const max = amex ? 15 : 16;
  const x = d.slice(0, max);
  return (amex ? [x.slice(0, 4), x.slice(4, 10), x.slice(10)] : x.match(/.{1,4}/g) || []).filter(Boolean).join(' ');
}
export function formatExpiry(v, prev = '') {
  let d = (v || '').replace(/\D/g, '').slice(0, 4);
  if (d.length === 1 && +d > 1) d = '0' + d;
  if (d.length >= 2 && +d.slice(0, 2) > 12) d = '12' + d.slice(2);
  if (prev.length > v.length && prev.endsWith('/') ) return d.slice(0, 2);
  return d.length > 2 ? d.slice(0, 2) + ' / ' + d.slice(2) : d.length === 2 && v.length >= 2 && prev.length < v.length ? d + ' / ' : d;
}

const BRAND_LABEL = { visa: 'VISA', mc: '', uzcard: 'UZCARD', humo: 'HUMO', amex: 'AMEX', unionpay: 'UNION' };
export function Brand({ brand, dim }) {
  if (brand === 'mc') return <span className={'ci ci-mc' + (dim ? ' dim' : '')}><i /><i /></span>;
  const cls = { visa: 'ci-visa', uzcard: 'ci-uz', humo: 'ci-humo', amex: 'ci-amex', unionpay: 'ci-union' }[brand];
  return <span className={'ci ' + cls + (dim ? ' dim' : '')}>{BRAND_LABEL[brand]}</span>;
}

export default function CardFields({ t, card, setCard, saved = [], selected, onSelect, errors = {}, valid = {}, onTouch = () => {} }) {
  const brand = detectBrand(card.number);
  const cvcLen = brand === 'amex' ? 4 : 3;
  const showForm = !selected;
  const upd = (patch) => setCard((c) => ({ ...c, ...patch }));
  const fc = (f) => 'co-field' + (errors[f] ? ' invalid' : valid[f] ? ' valid' : '');
  const aria = (f, id) => ({ 'aria-invalid': errors[f] ? 'true' : undefined, 'aria-describedby': errors[f] ? id + 'Err' : undefined });

  return (
    <div className="co-card-block">
      {saved.length > 0 && (
        <div className="co-saved">
          <div className="co-sub-title">{t('pay.card.saved')}</div>
          {saved.map((c) => (
            <label key={c.id} className={'co-saved-item' + (selected === c.id ? ' on' : '')}>
              <input type="radio" name="savedCard" checked={selected === c.id} onChange={() => onSelect(c.id)} />
              <Brand brand={c.brand} />
              <span className="co-saved-txt"><b>•••• {c.last4}</b><small>{t('pay.card.expires')} {c.exp}</small></span>
            </label>
          ))}
          <label className={'co-saved-item' + (!selected ? ' on' : '')}>
            <input type="radio" name="savedCard" checked={!selected} onChange={() => onSelect('')} />
            <span className="co-saved-plus">+</span>
            <span className="co-saved-txt"><b>{t('pay.card.newCard')}</b></span>
          </label>
        </div>
      )}

      {showForm && (
        <>
          <div className={fc('cardNum')}>
            <label htmlFor="coCardNum">{t('pay.card.number')}</label>
            <div className="co-input-with-icons">
              <input id="coCardNum" type="text" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456"
                     {...aria('cardNum', 'coCardNum')} value={card.number} onBlur={() => onTouch('cardNum')} onChange={(e) => upd({ number: formatCardNumber(e.target.value) })} />
              <div className="co-card-icons">
                {brand ? <Brand brand={brand} /> : <><Brand brand="visa" dim /><Brand brand="mc" dim /><Brand brand="uzcard" dim /><Brand brand="humo" dim /></>}
              </div>
            </div>
            <div className="err-text" id="coCardNumErr" role="alert">{errors.cardNum}</div>
          </div>
          <div className="co-row2 co-row-keep">
            <div className={fc('exp')}>
              <label htmlFor="coCardExp">{t('pay.card.expiry')}</label>
              <input id="coCardExp" type="text" inputMode="numeric" autoComplete="cc-exp" placeholder="MM / YY" maxLength={7}
                     {...aria('exp', 'coCardExp')} value={card.exp} onBlur={() => onTouch('exp')} onChange={(e) => upd({ exp: formatExpiry(e.target.value, card.exp) })} />
              <div className="err-text" id="coCardExpErr" role="alert">{errors.exp}</div>
            </div>
            <div className={fc('cvc')}>
              <label htmlFor="coCardCvc">{t('pay.card.cvc')}</label>
              <input id="coCardCvc" type="password" inputMode="numeric" autoComplete="cc-csc" placeholder={'•'.repeat(cvcLen)} maxLength={cvcLen}
                     {...aria('cvc', 'coCardCvc')} value={card.cvc} onBlur={() => onTouch('cvc')} onChange={(e) => upd({ cvc: e.target.value.replace(/\D/g, '').slice(0, cvcLen) })} />
              <div className="err-text" id="coCardCvcErr" role="alert">{errors.cvc}</div>
            </div>
          </div>
          <div className={fc('cardName')}>
            <label htmlFor="coCardName">{t('pay.card.name')}</label>
            <input id="coCardName" type="text" autoComplete="cc-name" placeholder="JOHN DOE" style={{ textTransform: 'uppercase' }}
                   {...aria('cardName', 'coCardName')} value={card.name} onBlur={() => onTouch('cardName')} onChange={(e) => upd({ name: e.target.value.replace(/[^\p{L}\s.'-]/gu, '').slice(0, 40) })} />
            <div className="err-text" id="coCardNameErr" role="alert">{errors.cardName}</div>
          </div>
        </>
      )}
      <p className="co-muted co-card-note">{t('pay.card.note')}</p>
    </div>
  );
}
