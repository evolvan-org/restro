import jwt from 'jsonwebtoken';

export function signAccessToken(
  payload: { userId: string; restaurantId: string; roleId: string; authVersion: number },
  secret: string,
): string {
  return jwt.sign(payload, secret, { expiresIn: '1d', algorithm: 'HS256' });
}
