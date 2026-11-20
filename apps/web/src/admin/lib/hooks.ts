'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { api, type Page } from './api';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Cursor-paginated list ("Load more"). `path` must already include its query string (or none). */
export function usePagedList<T>(key: QueryKey, path: string, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: [...key, path],
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const sep = path.includes('?') ? '&' : '?';
      return api<Page<T>>(pageParam ? `${path}${sep}cursor=${encodeURIComponent(pageParam)}` : path);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
  return {
    rows: q.data?.pages.flatMap((p) => p.items),
    isLoading: q.isLoading,
    error: q.error,
    hasMore: q.hasNextPage,
    loadMore: () => void q.fetchNextPage(),
    loadingMore: q.isFetchingNextPage,
  };
}
