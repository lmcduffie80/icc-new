export default function ShopLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-10 w-48 bg-muted animate-pulse rounded-lg mb-4" />
        <div className="h-6 w-96 bg-muted animate-pulse rounded-lg" />
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-4 mb-8">
        <div className="h-10 w-32 bg-muted animate-pulse rounded-lg" />
        <div className="h-10 w-32 bg-muted animate-pulse rounded-lg" />
      </div>

      {/* Products grid skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="rounded-lg border border-border overflow-hidden">
            <div className="aspect-square bg-muted animate-pulse" />
            <div className="p-4 space-y-3">
              <div className="h-5 w-3/4 bg-muted animate-pulse rounded" />
              <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
              <div className="h-6 w-1/3 bg-muted animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
