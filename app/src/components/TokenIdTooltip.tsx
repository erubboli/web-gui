function mid(id: string) {
  return id.length > 16 ? `${id.slice(0, 7)}…${id.slice(-7)}` : id;
}

export function TokenIdTooltip({ tokenId, align = 'left' }: { tokenId: string; align?: 'left' | 'right' }) {
  const anchorCls = align === 'right' ? 'right-0' : 'left-0';
  return (
    <span className="relative group/info inline-flex items-center">
      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        className="text-gray-600 group-hover/info:text-gray-400 transition-colors cursor-default shrink-0"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className={`pointer-events-none absolute bottom-full ${anchorCls} mb-2 z-20
                       w-max rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 shadow-2xl
                       opacity-0 group-hover/info:opacity-100 transition-opacity`}>
        <span className="block text-gray-500 text-xs mb-0.5 font-sans">Token ID</span>
        <span className="block font-mono text-xs text-gray-200 whitespace-nowrap">{mid(tokenId)}</span>
      </span>
    </span>
  );
}
