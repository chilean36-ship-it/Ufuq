/** Temporary placeholder for pages that have not been ported to React yet (see MIGRATION.md). */
export default function Pending({ name }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#121212', color: '#EDEAE3', fontFamily: 'Inter, sans-serif' }}>
      <p>“{name}” is being migrated to React — coming in the next step.</p>
    </div>
  );
}
