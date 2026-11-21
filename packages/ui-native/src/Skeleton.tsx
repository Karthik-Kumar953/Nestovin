import { View, type DimensionValue } from 'react-native';
import { Shimmer } from './motion/Shimmer';

/** Placeholder block with a light sweep. Hidden from screen readers; pair with one `accessibilityLabel="Loading"` container. */
export function Skeleton({ width = '100%', height = 16, radius = 8, className = '' }: { width?: DimensionValue; height?: number; radius?: number; className?: string }) {
  return (
    <View style={{ width, height, borderRadius: radius }} className={`bg-teal-100/70 overflow-hidden ${className}`} accessible={false} importantForAccessibility="no-hide-descendants">
      <Shimmer />
    </View>
  );
}

/** Card-shaped skeleton matching the list cards. */
export function SkeletonCard({ lines = 2, media = false }: { lines?: number; media?: boolean }) {
  return (
    <View className="bg-white rounded-xl border border-line/70 p-5 gap-3" accessible={false}>
      {media ? <Skeleton height={140} radius={16} /> : null}
      <View className="flex-row gap-3 items-center">
        <Skeleton width={44} height={44} radius={14} />
        <View className="flex-1 gap-2">
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Skeleton key={i} width={i % 2 ? '70%' : '90%'} height={12} />
      ))}
    </View>
  );
}

/** A screen-sized loading state: announced once as "Loading". */
export function SkeletonList({ count = 3, media = false }: { count?: number; media?: boolean }) {
  return (
    <View className="gap-3" accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} media={media && i === 0} />
      ))}
    </View>
  );
}
