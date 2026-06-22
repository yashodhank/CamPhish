interface Props {
  hasMore: boolean
  loading: boolean
  onLoad: () => void
}

export default function LoadMoreButton({ hasMore, loading, onLoad }: Props) {
  if (!hasMore) return null
  return (
    <div className="flex justify-center py-4">
      <button onClick={onLoad} disabled={loading}
        className="px-6 py-2 rounded-lg text-sm transition-colors"
        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary)' }}>
        {loading ? 'Loading...' : 'Load More'}
      </button>
    </div>
  )
}
