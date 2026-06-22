interface Props {
  error: string | null
  onDismiss: () => void
}

export default function ErrorBanner({ error, onDismiss }: Props) {
  if (!error) return null
  return (
    <div className="content-card border-0 !border-l-2" style={{ borderLeftColor: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--accent)' }}>⚠ {error}</span>
        <button onClick={onDismiss} className="text-xs text-tertiary hover:text-primary">✕</button>
      </div>
    </div>
  )
}
