// Skeleton loaders — para carga inicial de datos (no para acciones del usuario).
// Regla binaria: datos=Skeleton, acción=spinner inline en botón. STARTER_UX §4.

export function SkeletonRow({ cols = 3 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 p-4 animate-pulse">
      <div className="w-8 h-8 bg-stone-200 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-stone-200 rounded w-1/3" />
        <div className="h-3 bg-stone-100 rounded w-1/4" />
      </div>
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <div key={i} className="h-4 bg-stone-100 rounded w-20 shrink-0" />
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 3,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden divide-y divide-stone-50">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border border-stone-100 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-stone-200 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-stone-200 rounded w-1/2" />
          <div className="h-3 bg-stone-100 rounded w-3/4" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({
  items = 3,
  itemHeight = "h-20",
}: {
  items?: number;
  itemHeight?: string;
}) {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className={`bg-white rounded-xl border border-stone-200 ${itemHeight}`}
        />
      ))}
    </div>
  );
}

export function SkeletonDetail() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 space-y-4 animate-pulse">
      <div className="h-6 bg-stone-200 rounded w-1/3" />
      <div className="h-40 bg-stone-200 rounded" />
      <div className="h-20 bg-stone-200 rounded" />
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex gap-4 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 bg-stone-100 rounded-lg w-40" />
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-sm p-4 border border-stone-100 space-y-3">
        <div className="h-5 bg-stone-200 rounded w-64" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <div className="w-3 h-3 bg-stone-200 rounded shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-4 bg-stone-200 rounded w-48" />
              <div className="h-3 bg-stone-100 rounded w-32" />
            </div>
            <div className="h-3 bg-stone-100 rounded w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
