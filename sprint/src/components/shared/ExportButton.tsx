import { useState, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';

export function ExportButton() {
  const savedCases = useAppStore(s => s.savedCases);
  const [generating, setGenerating] = useState(false);

  const generate = useCallback(async () => {
    if (generating || savedCases.length === 0) return;
    setGenerating(true);
    try {
      const [pdfModule, { PlaybookDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../pdf/PlaybookDocument'),
      ]);
      const { createElement } = await import('react');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdfModule.pdf(createElement(PlaybookDocument, { cases: savedCases }) as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Top-of-the-Prompts-picks.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, [savedCases, generating]);

  const disabled = generating || savedCases.length === 0;

  return (
    <button
      onClick={generate}
      disabled={disabled}
      className="flex-1 rounded-full py-3 text-sm font-semibold transition-all"
      style={{
        background: disabled ? 'rgba(0,0,0,0.06)' : 'var(--apple-blue)',
        color: disabled ? 'var(--text-tertiary)' : '#fff',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: disabled ? 'none' : '0 2px 10px rgba(0,113,227,0.3)',
      }}
    >
      {generating ? 'Generating...' : 'Download prompts as PDF'}
    </button>
  );
}
