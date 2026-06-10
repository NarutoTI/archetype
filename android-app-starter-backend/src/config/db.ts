import { Db, MongoClient } from 'mongodb';
import logger from './logger.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToMongo(customUri: string | null = null): Promise<{ client: MongoClient | null; db: Db }> {
  if (db) return { client, db };

  const uri = customUri || process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017';
  const dbName = process.env.MONGODB_DB || 'android-app-starter';

  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  });

  await client.connect();
  db = client.db(dbName);
  logger.info('Connected to MongoDB database: %s', dbName);

  await createIndexes();
  return { client, db };
}

async function createIndexes(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized. Call connectToMongo() first.');
  }

  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('users').createIndex({ provider: 1 });
  await db.collection('versions').createIndex({ platform: 1 }, { unique: true });
  await db.collection('tasks').createIndex({ userId: 1, dueDate: 1 });
  await db.collection('tasks').createIndex({ userId: 1, completed: 1 });
  logger.info('Database indexes created successfully');
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized. Call connectToMongo() first.');
  }
  return db;
}

export function setMockDb(mockDb: Db): void {
  db = mockDb;
}
