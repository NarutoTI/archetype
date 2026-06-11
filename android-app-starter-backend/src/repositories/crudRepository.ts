import {
  Collection,
  Document,
  Filter,
  ObjectId,
  Sort,
  UpdateFilter,
  WithId
} from 'mongodb';
import { getDb } from '../config/db.js';

type MongoId = string | ObjectId;
type MutableDocument = Document & { _id?: MongoId };

const toObjectId = (id: MongoId): ObjectId => (
  typeof id === 'string' ? ObjectId.createFromHexString(id) : id
);

export default class CrudRepository<TDocument extends Document = Document> {
  private collection: Collection<TDocument> | null = null;

  constructor(private readonly collectionName: string) {}

  getCollection(): Collection<TDocument> {
    if (!this.collection) {
      this.collection = getDb().collection<TDocument>(this.collectionName);
    }
    return this.collection;
  }

  async count(): Promise<number> {
    return this.getCollection().estimatedDocumentCount();
  }

  async countByKeyValue(key: string, value: unknown): Promise<number> {
    const query = { [key]: value } as Filter<TDocument>;
    const result = await this.getCollection().aggregate<{ total: number }>([
      { $match: query },
      { $count: 'total' }
    ]).toArray();

    return result[0]?.total || 0;
  }

  async findLastByKeyValue(key: string, value: unknown, sort?: string): Promise<WithId<TDocument> | undefined> {
    const query = { [key]: value } as Filter<TDocument>;
    const sortOptions = sort ? ({ [sort]: -1 } as Sort) : {};
    const result = await this.getCollection().find(query).sort(sortOptions).limit(1).toArray();
    return result[0];
  }

  async findByKeyValue(key: string, value: unknown): Promise<WithId<TDocument>[]> {
    return this.getCollection().find({ [key]: value } as Filter<TDocument>).toArray();
  }

  async findByKeyPattern(key: string, pattern: string, max?: number): Promise<WithId<TDocument>[]> {
    const cursor = this.getCollection().find({
      [key]: { $regex: `^${pattern}` }
    } as Filter<TDocument>);

    return (max ? cursor.limit(max) : cursor).toArray();
  }

  async update(doc: MutableDocument): Promise<Awaited<ReturnType<Collection<TDocument>['updateOne']>>> {
    if (!doc._id) {
      throw new Error(`Documento [${this.collectionName}] não possui id para atualizar.`);
    }

    const _id = toObjectId(doc._id);
    const updateDoc = { ...doc };
    delete updateDoc._id;

    const result = await this.getCollection().updateOne(
      { _id } as Filter<TDocument>,
      { $set: updateDoc } as UpdateFilter<TDocument>
    );
    doc._id = _id;
    return result;
  }

  async updateById(id: MongoId, updateData: Document): Promise<Awaited<ReturnType<Collection<TDocument>['updateOne']>>> {
    return this.getCollection().updateOne(
      { _id: toObjectId(id) } as Filter<TDocument>,
      { $set: updateData } as UpdateFilter<TDocument>
    );
  }

  async upsert(doc: MutableDocument): Promise<unknown> {
    return doc._id ? this.update(doc) : this.insert(doc as TDocument);
  }

  async updateOne(query: Filter<TDocument>, update: UpdateFilter<TDocument>, upsert = false) {
    return this.getCollection().updateOne(query, update, { upsert });
  }

  async updateByKeyValue(_id: MongoId, key: string, value: unknown): Promise<WithId<TDocument> | null> {
    const response = await this.getCollection().findOneAndUpdate(
      { _id: toObjectId(_id) } as Filter<TDocument>,
      { $set: { [key]: value } as Document } as UpdateFilter<TDocument>,
      { returnDocument: 'after' }
    );

    return response;
  }

  async findOne(query: Filter<TDocument>): Promise<WithId<TDocument> | null> {
    return this.getCollection().findOne(query);
  }

  async findOneAndUpdateByKeyValue(key: string, value: unknown, newValue: unknown) {
    return this.getCollection().findOneAndUpdate(
      { [key]: value } as Filter<TDocument>,
      { $set: { [key]: newValue } as Document } as UpdateFilter<TDocument>,
      { returnDocument: 'after' }
    );
  }

  /**
   * Busca e atualiza um documento atomicamente, retornando o documento
   * APÓS a escrita. Com upsert=true, o documento inserido é retornado na
   * primeira gravação — alternativa em um único roundtrip a updateOne + findOne.
   */
  async findOneAndUpdate(
    query: Filter<TDocument>,
    update: UpdateFilter<TDocument>,
    upsert = false,
  ): Promise<WithId<TDocument> | null> {
    return this.getCollection().findOneAndUpdate(
      query,
      update,
      { returnDocument: 'after', upsert },
    );
  }

  async findAll(limit = 100, skip = 0, sort: Sort = {}): Promise<WithId<TDocument>[]> {
    return this.getCollection().find().limit(limit).skip(skip).sort(sort).toArray();
  }

  async insert(object: TDocument) {
    return this.getCollection().insertOne(object as Parameters<Collection<TDocument>['insertOne']>[0]);
  }

  async removeById(id: MongoId) {
    return this.getCollection().deleteOne({ _id: toObjectId(id) } as Filter<TDocument>);
  }

  async deleteById(id: MongoId): Promise<boolean> {
    const result = await this.removeById(id);
    return result.deletedCount > 0;
  }

  async deleteMany(query: Filter<TDocument>) {
    return this.getCollection().deleteMany(query);
  }

  async find(query: Filter<TDocument>): Promise<WithId<TDocument>[]> {
    return this.getCollection().find(query).toArray();
  }

  async findById(id: MongoId): Promise<WithId<TDocument> | null> {
    try {
      return this.getCollection().findOne({ _id: toObjectId(id) } as Filter<TDocument>);
    } catch {
      return null;
    }
  }

  async countByAggregate(pipeline: Document[]): Promise<number> {
    const result = await this.getCollection().aggregate<{ count: number }>(pipeline).toArray();
    return result[0]?.count || 0;
  }

  async findByAggregate(pipeline: Document[]): Promise<Document[]> {
    return this.getCollection().aggregate(pipeline).toArray();
  }

  async insertMany(docs: TDocument[]) {
    const result = await this.getCollection().insertMany(
      docs as unknown as Parameters<Collection<TDocument>['insertMany']>[0]
    );
    return result.insertedIds;
  }

  async updateMany(filter: Filter<TDocument>, update: UpdateFilter<TDocument>): Promise<number> {
    const result = await this.getCollection().updateMany(filter, update);
    return result.modifiedCount;
  }

  async updateBulk(docs: MutableDocument[]) {
    if (!Array.isArray(docs) || docs.length === 0) {
      throw new Error(`Array de documentos [${this.collectionName}] não pode ser vazio.`);
    }

    const bulkOps = docs.map((doc) => {
      if (!doc._id) {
        throw new Error(`Documento [${this.collectionName}] não possui id para atualizar.`);
      }

      const _id = toObjectId(doc._id);
      const updateDoc = { ...doc };
      delete updateDoc._id;

      return {
        updateOne: {
          filter: { _id } as Filter<TDocument>,
          update: { $set: updateDoc } as UpdateFilter<TDocument>
        }
      };
    });

    const result = await this.getCollection().bulkWrite(bulkOps);
    return {
      success: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount
    };
  }
}
