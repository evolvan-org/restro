import { type LoginRequest, type LoginResponse, loginResponseSchema } from '@rms/api-contract';
import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api';
import useAppDispatch from '@/store/hooks/useAppDispatch';
import { actions } from '@/store/slices/auth';

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
