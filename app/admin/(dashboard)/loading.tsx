export default function AdminLoading() {
  return (
    <div className="p-6">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-lg mb-2" />
        <div className="h-5 w-64 bg-muted animate-pulse rounded-lg" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border p-6 space-y-3"
          >
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            <div className="h-3 w-32 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-border">
        <div className="p-4 border-b border-border">
          <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="divide-y divide-border">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 bg-muted animate-pulse rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                <div className="h-3 w-32 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
