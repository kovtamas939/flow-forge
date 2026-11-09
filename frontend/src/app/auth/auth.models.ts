export type RegisterRequestDto = {
  email: string;
  password: string;
};

export type LoginRequestDto = {
  email: string;
  password: string;
};

export type AuthenticatedUserDto = {
  id: string;
  email: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
};

export type CurrentUserResponseDto = {
  user: AuthenticatedUserDto;
};

export type ApiErrorResponseDto = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};