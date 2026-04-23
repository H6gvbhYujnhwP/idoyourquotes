/**
 * DashboardLayoutSkeleton — loading-state mirror of the v2 top-nav
 * chrome (logo left, nav centre, avatar right).
 *
 * Rendered while useAuth() is loading. Stays visually close to the
 * real DashboardLayout so the user sees a stable shell rather than a
 * layout flash when auth resolves.
 *
 * Chunk 3 Delivery G — header grew from 56px → 64px and the breadcrumb
 * strip was removed. Keep this file in sync with DashboardLayout.tsx
 * whenever either of those sizes change.
 */
import { Skeleton } from './ui/skeleton';

export function DashboardLayoutSkeleton() {
  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: 'var(--brand-bg)' }}
    >
      {/* Top nav skeleton */}
      <div
        className="flex items-center justify-between h-16 px-6 border-b"
        style={{ borderColor: 'var(--brand-border)' }}
      >
        <Skeleton className="h-11 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
