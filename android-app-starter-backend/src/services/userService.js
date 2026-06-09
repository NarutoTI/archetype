import { ObjectId } from 'mongodb';
import CrudRepository from '../repositories/crudRepository.js';
import logger from '../config/logger.js';

const userRepository = new CrudRepository('users');

const normalizeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    ...user,
    id: user._id?.toString() || user.id
  };
};

export async function findByEmail(email) {
  try {
    return normalizeUser(await userRepository.findOne({ email }));
  } catch (error) {
    logger.error({ err: error, email }, 'Error finding user by email');
    throw error;
  }
}

export async function findById(id) {
  try {
    const objectId = typeof id === 'string' ? ObjectId.createFromHexString(id) : id;
    return normalizeUser(await userRepository.findById(objectId));
  } catch (error) {
    logger.error({ err: error, id }, 'Error finding user by id');
    throw error;
  }
}

export async function create(user) {
  try {
    const now = new Date();
    const data = {
      ...user,
      createdAt: now,
      updatedAt: now
    };

    const result = await userRepository.insert(data);
    return normalizeUser({
      ...data,
      _id: result.insertedId
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating user');
    throw error;
  }
}

export async function update(user) {
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

export async function deleteUser(id) {
  try {
    const result = await userRepository.removeById(id);
    return result.deletedCount > 0;
  } catch (error) {
    logger.error({ err: error, id }, 'Error deleting user');
    throw error;
  }
}
