interface SkeletonProps {
  className?: string;
  height?: string | number;
  width?: string | number;
}

export function Skeleton({ className = '', height, width }: SkeletonProps) {
  return (
    <div
      className={`shimmer-base ${className}`}
      style={{ height, width }}
    />
  );
}

export function SkeletonLine({ width = '100%', className = '' }: { width?: string; className?: string }) {
  return <Skeleton className={`h-4 rounded-md ${className}`} width={width} />;
}

export function SkeletonBatchCard() {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <SkeletonLine width="160px" />
          <SkeletonLine width="100px" className="h-3" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="h-1.5 rounded-full" />
      <div className="flex justify-between">
        <SkeletonLine width="80px" className="h-3" />
        <SkeletonLine width="80px" className="h-3" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-4 w-20" />
    </div>
  );
}
