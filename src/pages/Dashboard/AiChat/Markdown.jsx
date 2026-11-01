/** Tiny, safe Markdown renderer for chat replies (no innerHTML): paragraphs, lists, headings, code, bold/italic, links. */
const AR_RE = /[\u0600-\u06FF]/;
const UL_RE = /^\s*[-*•]\s+/;
const OL_RE = /^\s*\d+[.)]\s+/;
const H_RE = /^(#{1,3})\s+(.*)$/;

function inline(text, base) {
  const out = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let m;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = base + '-' + n++;
    if (tok[0] === '`') out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('**')) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok[0] === '*') out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else {
      const mm = tok.match(/^\[([^\]]+)\]\((.+)\)$/);
      out.push(<a key={key} href={mm[2]} target="_blank" rel="noopener noreferrer">{mm[1]}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function parse(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      blocks.push({ t: 'code', text: buf.join('\n') });
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const h = line.match(H_RE);
    if (h) { blocks.push({ t: 'h', text: h[2] }); i++; continue; }
    if (UL_RE.test(line)) {
      const items = [];
      while (i < lines.length && UL_RE.test(lines[i])) { items.push(lines[i].replace(UL_RE, '')); i++; }
      blocks.push({ t: 'ul', items });
      continue;
    }
    if (OL_RE.test(line)) {
      const items = [];
      while (i < lines.length && OL_RE.test(lines[i])) { items.push(lines[i].replace(OL_RE, '')); i++; }
      blocks.push({ t: 'ol', items });
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !H_RE.test(lines[i]) && !UL_RE.test(lines[i]) && !OL_RE.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    if (!buf.length) { buf.push(lines[i]); i++; }
    blocks.push({ t: 'p', lines: buf });
  }
  return blocks;
}

export default function Markdown({ text }) {
  const blocks = parse(text);
  return (
    <div className="uai-md">
      {blocks.map((b, bi) => {
        const k = 'b' + bi;
        if (b.t === 'code') return <pre key={k} dir="ltr"><code>{b.text}</code></pre>;
        if (b.t === 'h') return <p key={k} className={'uai-h' + (AR_RE.test(b.text) ? ' ar' : '')} dir="auto">{inline(b.text, k)}</p>;
        if (b.t === 'ul' || b.t === 'ol') {
          const Tag = b.t;
          return (
            <Tag key={k}>
              {b.items.map((it, ii) => <li key={ii} dir="auto" className={AR_RE.test(it) ? 'ar' : undefined}>{inline(it, k + 'i' + ii)}</li>)}
            </Tag>
          );
        }
        const joined = b.lines.join(' ');
        return (
          <p key={k} dir="auto" className={AR_RE.test(joined) ? 'ar' : undefined}>
            {b.lines.map((ln, li) => (
              <span key={li}>{li > 0 ? <br /> : null}{inline(ln, k + 'l' + li)}</span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
