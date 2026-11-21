/**
 * Query keys for the roles domain. One enum per API domain (Yoho convention):
 * every `useQuery`/`useMutation` in `requests/roles.ts` keys off a member here.
 */
export enum RolesQueryKey {
  Roles = 'roles',
  Role = 'role',
}
