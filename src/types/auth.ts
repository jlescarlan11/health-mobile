export type SexAtBirth = 'male' | 'female' | 'intersex' | 'not_specified';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  dateOfBirth: string;
  sexAtBirth?: SexAtBirth;
}
