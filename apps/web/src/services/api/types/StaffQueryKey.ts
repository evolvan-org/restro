/**
 * Query keys for the staff domain. One enum per API domain (Yoho convention):
 * every `useQuery`/`useMutation` in `requests/staff.ts` keys off a member here.
 */
export enum StaffQueryKey {
  Staff = 'staff',
  Roles = 'staff-roles',
}
