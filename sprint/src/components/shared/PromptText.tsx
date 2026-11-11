/**
 * A prompt with its [bracket] in bold: the bracket is the only part to change,
 * so it should be the part the eye lands on. Same rule as the try-it page.
 */
export function PromptText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]*\])/).map((part, i) =>
        part.startsWith('[')
          ? <strong key={i} style={{ color: 'var(--apple-blue-dark)', fontWeight: 700 }}>{part}</strong>
          : part
      )}
    </>
  );
}

/**
 * Things the bracket could be, as small tags on one row. A tag that would not fit on
 * the row is left out rather than wrapped, so the row never breaks in two.
 */
export function Examples({ items, upload }: { items: string[]; upload?: { icon: 'photo' | 'file' | 'sheet' | 'mic'; text: string } | null }) {
  if (items.length === 0 && !upload) return null;
  return (
    // "Try" sits in the row's left margin, not in the row: a first tag too wide to share
    // the line with it is shortened with "..." where it stands, never pushed down and cut.
    <div className="relative flex flex-wrap items-center gap-x-1.5 gap-y-3 overflow-hidden pl-[34px]" style={{ maxHeight: '2rem' }}>
      <span className="absolute left-0 top-0 text-[10px] font-bold uppercase tracking-widest leading-[1.5rem] md:leading-[1.75rem]" style={{ color: 'var(--text-tertiary)' }}>
        Try
      </span>
      {items.map(item => (
        <span
          key={item}
          className="text-xs md:text-sm px-3 py-1 rounded-full whitespace-nowrap max-w-full truncate"
          style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}
        >
          {item}
        </span>
      ))}
      {/* "or upload a photo": the last tag on the row, outlined, with an icon */}
      {upload && (
        <span
          className="text-xs md:text-sm px-3 py-1 rounded-full whitespace-nowrap max-w-full truncate"
          style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        >
          <span aria-hidden="true">{({ photo: '📷', file: '📎', sheet: '📊', mic: '🎤' })[upload.icon]}</span>{' '}
          {upload.text.charAt(0).toLowerCase() + upload.text.slice(1)}
        </span>
      )}
    </div>
  );
}
