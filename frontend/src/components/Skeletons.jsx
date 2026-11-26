import React from 'react';

/**
 * Universal Material Design Shimmer Skeleton Building Blocks
 */
export function SkeletonBlock({ width = '100%', height = '16px', borderRadius = '6px', style = {}, className = '' }) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

export function SkeletonCircle({ size = 40, style = {} }) {
  return (
    <SkeletonBlock
      width={`${size}px`}
      height={`${size}px`}
      borderRadius="50%"
      style={{ flexShrink: 0, ...style }}
    />
  );
}

export function SkeletonLine({ width = '100%', height = '14px', style = {} }) {
  return <SkeletonBlock width={width} height={height} borderRadius="4px" style={style} />;
}

/**
 * CardSkeleton - For KPI / metric cards grid
 */
export function CardSkeleton({ count = 4, height = 110 }) {
  return (
    <div className="skeleton-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`, gap: '16px', width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card skeleton-card-box" style={{ height, padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SkeletonLine width="45%" height="13px" />
            <SkeletonCircle size={24} />
          </div>
          <SkeletonBlock width="60%" height="28px" borderRadius="8px" />
          <SkeletonLine width="80%" height="11px" />
        </div>
      ))}
    </div>
  );
}

/**
 * TableSkeleton - For DataTables and tabular views
 */
export function TableSkeleton({ rows = 6, columns = 6 }) {
  return (
    <div className="card" style={{ padding: '20px', width: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <SkeletonLine width="200px" height="22px" />
        <div style={{ display: 'flex', gap: '10px' }}>
          <SkeletonBlock width="140px" height="34px" borderRadius="8px" />
          <SkeletonBlock width="80px" height="34px" borderRadius="8px" />
        </div>
      </div>
      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--line, #e2e8f0)' }}>
              {Array.from({ length: columns }).map((_, c) => (
                <th key={c} style={{ padding: '12px 14px', textAlign: 'left' }}>
                  <SkeletonLine width={`${50 + (c % 3) * 20}%`} height="12px" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} style={{ borderBottom: '1px solid var(--line, #e2e8f0)' }}>
                {Array.from({ length: columns }).map((_, c) => (
                  <td key={c} style={{ padding: '14px', verticalAlign: 'middle' }}>
                    {c === 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <SkeletonCircle size={28} />
                        <SkeletonLine width="110px" height="13px" />
                      </div>
                    ) : (
                      <SkeletonLine width={`${40 + ((r + c) % 4) * 15}%`} height="12px" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * ChartSkeleton - For analytical and trend charts
 */
export function ChartSkeleton({ height = 260, title = 'Loading Analytics…' }) {
  return (
    <div className="card" style={{ padding: '20px', minHeight: height, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <SkeletonLine width="160px" height="18px" />
        <SkeletonLine width="70px" height="14px" />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '14px', padding: '10px 0' }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const heights = [40, 75, 55, 90, 65, 80, 45, 95];
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}>
              <SkeletonBlock width="100%" height={`${heights[i % heights.length]}%`} borderRadius="6px 6px 0 0" />
              <SkeletonLine width="80%" height="10px" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * FormSkeleton - For creation and edit forms
 */
export function FormSkeleton({ fields = 6 }) {
  return (
    <div className="card" style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '24px' }}>
        <SkeletonLine width="240px" height="24px" style={{ marginBottom: '8px' }} />
        <SkeletonLine width="380px" height="14px" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <SkeletonLine width="35%" height="12px" />
            <SkeletonBlock width="100%" height="40px" borderRadius="8px" />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--line, #e2e8f0)', paddingTop: '18px' }}>
        <SkeletonBlock width="90px" height="38px" borderRadius="8px" />
        <SkeletonBlock width="120px" height="38px" borderRadius="8px" />
      </div>
    </div>
  );
}

/**
 * TrackingSkeleton - For shipment and LR tracking interfaces
 */
export function TrackingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      <div className="card" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <SkeletonLine width="180px" height="20px" style={{ marginBottom: '6px' }} />
            <SkeletonLine width="120px" height="13px" />
          </div>
          <SkeletonBlock width="100px" height="32px" borderRadius="20px" />
        </div>
        {/* Stepper skeleton */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <SkeletonCircle size={32} />
                <SkeletonLine width="60px" height="10px" />
              </div>
              {i < 4 && <SkeletonBlock width="12%" height="4px" borderRadius="2px" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="card" style={{ padding: '22px' }}>
        <SkeletonLine width="150px" height="18px" style={{ marginBottom: '20px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <SkeletonCircle size={14} style={{ marginTop: '4px' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <SkeletonLine width="180px" height="14px" />
                  <SkeletonLine width="70px" height="12px" />
                </div>
                <SkeletonLine width="260px" height="12px" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * DashboardSkeleton - Full enterprise Material dashboard shell placeholder
 */
export function DashboardSkeleton() {
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <SkeletonLine width="220px" height="28px" style={{ marginBottom: '8px' }} />
          <SkeletonLine width="340px" height="14px" />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <SkeletonBlock width="120px" height="38px" borderRadius="20px" />
          <SkeletonBlock width="110px" height="38px" borderRadius="20px" />
        </div>
      </div>

      {/* KPI Cards */}
      <CardSkeleton count={4} height={110} />

      {/* Charts & Analytics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        <ChartSkeleton height={260} />
        <ChartSkeleton height={260} />
      </div>

      {/* Recent Activity / PO Table */}
      <TableSkeleton rows={5} columns={5} />
    </div>
  );
}

/**
 * PageSkeleton - Standard fallback for general pages
 */
export function PageSkeleton({ title = 'Loading…' }) {
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div>
          <SkeletonLine width="180px" height="26px" style={{ marginBottom: '6px' }} />
          <SkeletonLine width="260px" height="13px" />
        </div>
        <SkeletonBlock width="110px" height="36px" borderRadius="8px" />
      </div>
      <TableSkeleton rows={6} columns={6} />
    </div>
  );
}

export default {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonLine,
  CardSkeleton,
  TableSkeleton,
  ChartSkeleton,
  FormSkeleton,
  TrackingSkeleton,
  DashboardSkeleton,
  PageSkeleton,
};
