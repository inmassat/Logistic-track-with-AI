import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createShipment, fetchSnapshot, markShipmentForReview } from './ai'

export const SNAPSHOT_KEY = ['snapshot'] as const

/**
 * Loads the network snapshot (shipments, metrics, fleet and activity) from
 * SQLite through the API. Every dashboard surface and every AI call reads
 * from this one query so they always agree.
 */
export function useNetwork() {
  return useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: fetchSnapshot,
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
}

export function useCreateShipment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createShipment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY }),
  })
}

export function useMarkForReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markShipmentForReview,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY }),
  })
}
