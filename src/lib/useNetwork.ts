import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDriver, createReport, createShipment, createSupportRequest, deleteConversation, dispatchVehicle, fetchConversations, fetchReports, fetchSettings, fetchSnapshot, fetchSupportRequests, markShipmentForReview, saveSettings } from './ai'

export const SNAPSHOT_KEY = ['snapshot'] as const
export const CONVERSATIONS_KEY = ['conversations'] as const
export const SETTINGS_KEY = ['settings'] as const
export const SUPPORT_KEY = ['support'] as const
export const REPORTS_KEY = ['reports'] as const

/**
 * Loads the network snapshot (shipments, metrics, fleet and activity) from
 * SQLite through the API. Every dashboard surface and every AI call reads
 * from this one query so they always agree. Disabled until a user is signed in.
 */
export function useNetwork(enabled: boolean) {
  return useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: fetchSnapshot,
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 60_000 : false,
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

export function useAddDriver() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createDriver,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY }),
  })
}

export function useDispatchVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: dispatchVehicle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY }),
  })
}

/** The signed-in user's workspace preferences from SQLite. */
export function useSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchSettings })
}

export function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveSettings,
    onSuccess: (result) => queryClient.setQueryData(SETTINGS_KEY, result.settings),
  })
}

/** The signed-in user's support requests from the help center, newest first. */
export function useSupportRequests() {
  return useQuery({
    queryKey: SUPPORT_KEY,
    queryFn: fetchSupportRequests,
    select: (result) => result.requests,
  })
}

export function useCreateSupportRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createSupportRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPORT_KEY }),
  })
}

/** The signed-in user's saved CSV exports, newest first. */
export function useReports() {
  return useQuery({
    queryKey: REPORTS_KEY,
    queryFn: fetchReports,
    select: (result) => result.reports,
  })
}

export function useCreateReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createReport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REPORTS_KEY }),
  })
}

/** The signed-in user's saved assistant conversations, newest first. */
export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: fetchConversations,
    select: (result) => result.conversations,
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
  })
}
