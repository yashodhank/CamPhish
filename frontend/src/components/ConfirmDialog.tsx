import { useEffect, useRef } from 'react'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    confirmRef.current?.focus()
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  if (!open) return null

  const confirmStyle = tone === 'danger'
    ? { backgroundColor: '#ff453a', color: '#fff' }
    : { backgroundColor: 'var(--accent)', color: 'var(--color-accent-ink)' }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)' }}
      onClick={() => { if (!busy) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md content-card-lg shadow-card-lg animate-scale-in"
        onClick={event => event.stopPropagation()}
      >
        <div className="space-y-2">
          <h2 id="confirm-dialog-title" className="text-lg font-semibold text-primary">{title}</h2>
          {description && <p className="text-sm text-tertiary leading-6">{description}</p>}
        </div>

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium radius-sm border border-subtle text-secondary hover:text-primary disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold radius-sm disabled:opacity-50"
            style={confirmStyle}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
