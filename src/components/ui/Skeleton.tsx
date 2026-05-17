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
    <div className="doppelrand-shell">
      <div className="doppelrand-core !p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <SkeletonLine width="200px" className="h-5" />
            <SkeletonLine width="120px" className="h-3 opacity-60" />
          </div>
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
        <Skeleton className="h-1.5 rounded-full w-full opacity-30" />
        <div className="flex justify-between">
          <SkeletonLine width="100px" className="h-3 opacity-60" />
          <SkeletonLine width="100px" className="h-3 opacity-60" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="doppelrand-shell mb-3">
      <div className="doppelrand-core !p-5 flex items-center gap-4">
        <Skeleton className="h-5 w-32 rounded-lg" />
        <Skeleton className="h-5 w-20 rounded-lg" />
        <Skeleton className="h-5 flex-1 rounded-lg" />
        <Skeleton className="h-5 w-24 rounded-lg" />
      </div>
    </div>
  );
}
