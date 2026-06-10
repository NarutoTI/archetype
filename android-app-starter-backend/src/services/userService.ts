import { ObjectId } from 'mongodb';
import CrudRepository from '../repositories/crudRepository.js';
import logger from '../config/logger.js';
import type { AppUser, AppUserInput } from '../types/schemas.js';

type UserDocument = AppUser & { _id?: ObjectId | string };

const userRepository = new CrudRepository<UserDocument>('users');

const normalizeUser = (user: UserDocument | null): AppUser | null => {
  if (!user) {
    return null;
  }

  return {
    ...user,
    id: user._id?.toString() || user.id
  };
};

export async function findByEmail(email: string): Promise<AppUser | null> {
  try {
    return normalizeUser(await userRepository.findOne({ email }));
  } catch (error) {
    logger.error({ err: error, email }, 'Error finding user by email');
    throw error;
  }
}

export async function findById(id: string | ObjectId): Promise<AppUser | null> {
  try {
    const objectId = typeof id === 'string' ? ObjectId.createFromHexString(id) : id;
    return normalizeUser(await userRepository.findById(objectId));
  } catch (error) {
    logger.error({ err: error, id }, 'Error finding user by id');
    throw error;
  }
}

export async function create(user: AppUserInput): Promise<AppUser> {
  try {
    const now = new Date();
    const data: UserDocument = {
      ...user,
      provider: user.provider || 'email',
      createdAt: now,
      updatedAt: now
    };

    const result = await userRepository.insert(data);
    const createdUser = normalizeUser({
      ...data,
      _id: result.insertedId
    });
    if (!createdUser) {
      throw new Error('Failed to normalize created user');
    }
    return createdUser;
  } catch (error) {
    logger.error({ err: error }, 'Error creating user');
    throw error;
  }
}

export async function update(user: AppUser): Promise<boolean> {
  try {
    const data = {
      ...user,
      updatedAt: new Date()
    };

    const result = await userRepository.update(data);
    return result.modifiedCount > 0;
  } catch (error) {
    logger.error({ err: error }, 'Error updating user');
    throw error;
  }
}

export async function deleteUser(id: string | ObjectId): Promise<boolean> {
  try {
    const result = await userRepository.removeById(id);
    return result.deletedCount > 0;
  } catch (error) {
    logger.error({ err: error, id }, 'Error deleting user');
    throw error;
  }
}
