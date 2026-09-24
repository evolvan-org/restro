import { useMutation } from '@tanstack/react-query';
import { loginResponseSchema, type LoginRequest, type LoginResponse } from '@rms/api-contract';

import { api } from '@/lib/api';
import { actions } from '@/store/slices/auth';

import useAppDispatch from '@/store/hooks/useAppDispatch';

const useLogin = () => {
  const dispatch = useAppDispatch();

  return useMutation({
    mutationFn: async (loginRequest: LoginRequest): Promise<LoginResponse> => {
      const response = await api.post('/auth/login', loginRequest);
      return loginResponseSchema.parse(response.data);
    },
    onSuccess: (response) => {
      dispatch(actions.login({ accessToken: response.accessToken }));
    },
  });
};

export { useLogin };
