interface Props {
  error: string | null
  onDismiss: () => void
  onRetry?: () => void
}

export default function ErrorBanner({ error, onDismiss, onRetry }: Props) {
  if (!error) return null
  return (
    <div className="content-card border-0 !border-l-2" style={{ borderLeftColor: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm" style={{ color: 'var(--accent)' }}>⚠ {error}</span>
        <div className="flex items-center gap-3">
          {onRetry && (
            <button onClick={onRetry} className="text-xs font-medium px-2 py-1 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)' }}>
              🔄 Retry
            </button>
          )}
          <button onClick={onDismiss} className="text-xs text-tertiary hover:text-primary">✕</button>
        </div>
      </div>
    </div>
  )
}
