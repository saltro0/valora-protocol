"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuditLogs } from "@/app/actions/audit";
import type { AuditLogEntry, AuditLogFilters, AuditLogPagination } from "@/types";

const PAGE_SIZE = 20;

export function useAuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [pagination, setPagination] = useState<AuditLogPagination>({
    total: 0,
    limit: PAGE_SIZE,
    offset: 0,
    hasMore: false,
  });

  const fetchLogs = useCallback(
    async (offset = 0, append = false) => {
      setLoading(true);
      setError(null);

      const result = await fetchAuditLogs(filters, PAGE_SIZE, offset);

      if (result.error) {
        setError(result.error);
      } else {
        setLogs((prev) => (append ? [...prev, ...result.logs] : result.logs));
        setPagination(result.pagination);
      }

      setLoading(false);
    },
    [filters]
  );

  useEffect(() => {
    fetchLogs(0);
  }, [fetchLogs]);

  const loadMore = useCallback(() => {
    if (pagination.hasMore) {
      fetchLogs(pagination.offset + PAGE_SIZE, true);
    }
  }, [fetchLogs, pagination]);

  const refresh = useCallback(() => {
    fetchLogs(0);
  }, [fetchLogs]);

  return { logs, loading, error, filters, setFilters, pagination, loadMore, refresh };
}
