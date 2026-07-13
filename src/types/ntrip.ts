/**
 * NTRIP Profile Management Types
 */

export interface NTRIPProfile {
  id: string;
  name: string;
  casterAddress: string;
  port: string;
  mountpoint: string;
  username: string;
  password: string;
  createdAt: string;
  updatedAt: string;
}

export interface NTRIPProfileCreate extends Omit<NTRIPProfile, 'id' | 'createdAt' | 'updatedAt'> {}

export interface NTRIPProfileUpdate extends Partial<Omit<NTRIPProfile, 'id' | 'createdAt' | 'updatedAt'>> {}
