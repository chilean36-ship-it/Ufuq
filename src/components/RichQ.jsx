/** Question text with red words: a teacher wraps words in double braces, e.g. `{{العمل}}`, and students / graders see them in red.
 *  Everything else is plain text (no HTML is ever interpreted). */
const RED = { color: '#e53935', fontWeight: 700 };

export default function RichQ({ text }) {
  const parts = String(text == null ? '' : text).split(/\{\{([^{}]+)\}\}/);
  return parts.map((p, i) => (i % 2 ? <span key={i} style={RED}>{p}</span> : p));
}
