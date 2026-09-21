import { useQueryClient } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';

import { actions } from '../slices/auth';
import { AuthState } from '../types/auth';

import useStoreSelector from './useStoreSelector';

/** Store the auth state (access token, …) returned by the login endpoint. */
export function useLogin() {
  const dispatch = useDispatch();
  return (payload: AuthState) => dispatch(actions.login(payload));
}

/** Clear auth state and drop all cached server data. */
export function useLogout() {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  return () => {
    queryClient.clear();
    dispatch(actions.logout());
  };
}

/** Read the current access token (undefined until logged in). */
export function useAccessToken() {
  return useStoreSelector(({ auth }) => auth.accessToken);
}
