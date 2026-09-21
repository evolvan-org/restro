/**
 * Query keys for the status domain. One enum per API domain (Yoho convention):
 * every `useQuery`/`useMutation` in `requests/status.ts` keys off a member here,
 * so caches invalidate by a single named constant rather than magic strings.
 */
export enum StatusQueryKey {
  Status = 'status',
}
