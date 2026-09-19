export function LoadingSpinner({ size = 'md', className = '' }) {
  const s = { sm:'w-4 h-4', md:'w-7 h-7', lg:'w-10 h-10' }[size] || 'w-7 h-7';
  return (
    <div
      className={`${s} rounded-full border-2 animate-spin ${className}`}
      style={{ borderColor:'var(--border)', borderTopColor:'var(--accent)' }}
    />
  );
}

export function PageLoader({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight:'320px', gap:'1rem' }}>
      <LoadingSpinner size="lg"/>
      <p className="text-sm font-medium" style={{ color:'var(--text-muted)' }}>{message}</p>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length:rows }).map((_,i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length:cols }).map((_,j) => (
            <div key={j} className="skeleton h-8 flex-1 rounded-lg"/>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length:count }).map((_,i) => (
        <div key={i} className="card">
          <div className="skeleton h-3 w-1/2 mb-3 rounded-full"/>
          <div className="skeleton h-7 w-3/4 mb-2 rounded-lg"/>
          <div className="skeleton h-2 w-1/3 rounded-full"/>
        </div>
      ))}
    </div>
  );
}
