/**
 * Query keys for the profile domain. One enum per API domain (Yoho convention):
 * every `useQuery`/`useMutation` in `requests/profile.ts` keys off a member here.
 * No per-user segment is needed: `useLogout` clears the whole query cache.
 */
export enum ProfileQueryKey {
  Profile = 'profile',
}
