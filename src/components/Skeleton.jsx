// components/Skeleton.jsx — minimal skeleton primitives
'use client';

export function Skeleton({ width, height = 12, radius = 4, style = {} }) {
  return (
    <span
      className="skeleton"
      style={{
        display: 'inline-block',
        width: width || '100%',
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function SkeletonRow({ cells = 4, height = 14 }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px' }}>
      {Array.from({ length: cells }).map((_, i) => (
        <Skeleton
          key={i}
          width={`${100 / cells - 5}%`}
          height={height}
          style={{ flex: 1 }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ rows = 4 }) {
  return (
    <div className="card">
      <div className="card-header">
        <Skeleton width={20} height={20} radius={4} />
        <Skeleton width={120} height={14} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} width={`${100 - i * 8}%`} height={12} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 4 }) {
  return (
    <div className="report-section" style={{ background: 'var(--bg-elevated)' }}>
      <div style={{
        background: 'linear-gradient(135deg,#1e40af,#3730a3)',
        borderRadius: 6,
        height: 28,
        marginBottom: 12,
        opacity: 0.7,
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: 8,
            padding: '8px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} width={c === 0 ? '60%' : '40%'} height={11} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
