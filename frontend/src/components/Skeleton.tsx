import { useMemo } from 'react'

export function SkeletonCard() {
  return (
    <div className="content-card animate-pulse">
      <div className="h-5 w-2/3 bg-primary rounded mb-3" />
      <div className="h-4 w-1/2 bg-tertiary rounded mb-2" />
      <div className="h-4 w-1/3 bg-tertiary rounded" />
    </div>
  )
}

export function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-4 animate-pulse py-3 border-b border-dim">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="flex-1 h-4 bg-tertiary rounded" style={{ opacity: 0.6 + i * 0.1 }} />
      ))}
    </div>
  )
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  const items = useMemo(() => Array.from({ length: count }), [count])
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {items.map((_, i) => (
        <div key={i} className="content-card animate-pulse">
          <div className="aspect-video bg-primary rounded-lg mb-3" />
          <div className="h-4 w-3/4 bg-tertiary rounded mb-2" />
          <div className="h-3 w-1/2 bg-tertiary rounded" />
        </div>
      ))}
    </div>
  )
}
