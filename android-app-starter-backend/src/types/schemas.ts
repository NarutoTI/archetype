import type { Request } from 'express';
import type { ObjectId } from 'mongodb';

export type UserProvider =
  | 'email'
  | 'google'
  | 'google_with_password'
  | 'development'
  | 'fake'
  | 'local';

export interface AppUser {
  _id?: ObjectId | string;
  id?: string;
  name: string;
  email: string;
  password?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  lastLogin?: Date;
  provider: UserProvider | string;
  accountStatus?: string;
  emailVerified?: boolean;
  isDevelopment?: boolean;
  language?: string;
  picture?: string | null;
  tokenType?: string;
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
  googleTokenExpiry?: Date | number | null;
  __v?: unknown;
}

export interface SafeUser extends Omit<AppUser, 'password' | 'googleAccessToken' | 'googleRefreshToken' | 'googleTokenExpiry' | '__v'> {
  id?: string;
}

export interface AppUserInput extends Omit<AppUser, '_id' | 'id' | 'createdAt' | 'updatedAt' | 'lastLogin' | 'provider' | 'googleAccessToken' | 'googleRefreshToken' | 'googleTokenExpiry' | '__v'> {
  name: string;
  email: string;
  provider?: UserProvider | string;
}

export interface Task {
  _id?: ObjectId | string;
  id?: string;
  userId: string;
  title: string;
  dueDate: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskInput {
  title: string;
  dueDate: string;
}

export interface UpdateTaskInput {
  title?: string;
  dueDate?: string;
  completed?: boolean;
}

export interface JwtUserPayload {
  id?: string;
  email: string;
  name?: string;
  picture?: string | null;
  provider?: string;
  tokenType?: string;
  iat?: number;
  exp?: number;
}

export interface ApiResponseDetails {
  [key: string]: unknown;
}

export interface AuthenticatedRequest extends Request {
  user: AppUser;
}

export type UnknownRecord = Record<string, unknown>;
