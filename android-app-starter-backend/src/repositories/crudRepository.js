import { getDb } from '../config/db.js';
import { ObjectId, Collection } from 'mongodb';

/**
 * CRUD API Class for common database operations
 */
export default class CrudRepository {
    
    /** @type {Collection} */
    collection = null;
    
    /**
     * Constructor
     * @param {String} collectionName - The name of the collection
     */
    constructor(collectionName) {
        this.collectionName = collectionName;
    }
    
    getCollection() {
        if (!this.collection) {
            this.collection = getDb().collection(this.collectionName);
        }
        return this.collection;
    }    

    /**
     * Count total number of documents in the collection
     * @return {Number}
     */
    async count() {
        return await this.getCollection().estimatedDocumentCount();
    }

    /**
     * Count number of documents by key value
     * @param {String} key - If ObjectId, must convert string before
     * @param {any} value - If ObjectId, must convert string before
     * @return {Number}
     */
    async countByKeyValue(key, value) {
        let query = {};
        query[key] = value;
        let result = await this.getCollection().aggregate([{
            $match: query
        }, {
            $count: 'total'
        }]).toArray();
        
        if (result && result.length) {
            return result[0].total;
        }
        return 0;
    }

    /**
     * Find last document by key value ordered by sort parameter
     * @param {String} key - The model property
     * @param {any} value - The property value
     * @param {String} sort - Sort field
     * @return {Object}
     */
    async findLastByKeyValue(key, value, sort) {
        let query = {};
        query[key] = value;
        let desc = {};
        if (sort) {
            desc[sort] = -1;
        }
        let res = await this.getCollection().find(query).sort(desc).limit(1).toArray();
        if (res.length) {
            return res[0];
        }
    }

    /**
     * Find documents by key value
     * @param {String} key - The search key
     * @param {any} value - The search value
     * @return {Promise<Array>}
     */
    async findByKeyValue(key, value) {
        let query = {};
        query[key] = value;
        return await this.getCollection().find(query).toArray();
    }

    /**
     * Find documents by key pattern
     * @param {String} key - The search key
     * @param {String} pattern - The regex pattern
     * @param {Number} max - Maximum results limit
     * @return {Array}
     */
    async findByKeyPattern(key, pattern, max) {
        let query = {};
        query[key] = {
            $regex: `^${pattern}`
        };
        if (max) {
            return await this.getCollection().find(query).limit(max).toArray();
        }
        return await this.getCollection().find(query).toArray();
    }

    /**
     * Update document by _id
     * @param {Object} doc - The document to update
     * @return {Object}
     */
    async update(doc) {
        if (!doc._id) {
            throw new Error(`The document [${this.collectionName}] does not have an id to update.`);
        }
        let _id = doc._id;
        delete doc._id;
        if (_id && typeof _id === 'string') {
            _id = ObjectId.createFromHexString(_id);
        }        
        const result = await this.getCollection().updateOne({ _id }, { $set: doc });
        doc._id = _id;
        return result;
    }

    /** update by id
     * @param {String} id - The document id
     * @param {Object} updateData - The data to update
     * @return {Object}
     */
    async updateById(id, updateData) {
        if (id && typeof id === 'string') {
            id = ObjectId.createFromHexString(id);
        }
        const result = await this.getCollection().updateOne({ _id: id }, { $set: updateData });
        return result;
    }    

    /**
     * Update or insert document (upsert)
     * @param {Object} doc - The document
     * @return {Object}
     */
    async upsert(doc) {
        if (doc._id) {
            return this.update(doc);
        }
        return this.insert(doc);
    }

    async updateOne(query, update, upsert = false) {
        return await this.getCollection().updateOne(query, update, { upsert: upsert });
    }

    /**
     * Update a document property by id
     * @param {ObjectId} _id - Document id
     * @param {String} key - Property name
     * @param {String} value - Property value
     * @return {Object}
     */
    async updateByKeyValue(_id, key, value) {
        let map = {};
        map[key] = value;
        let objId = _id;

        if (objId && typeof objId === 'string') {
            objId = ObjectId.createFromHexString(objId);
        }

        let response = await this.getCollection().findOneAndUpdate({
            _id: objId
        }, {
            $set: map
        }, {
            returnOriginal: false
        });

        return response.value ? response.value : null;
    }

    /**
     * Find one document by query
     * @param {Object} query - The query
     * @return {Object}
     */
    async findOne(query) {
        return await this.getCollection().findOne(query);
    }
    /**
     * Find one and update by key value
     * @param {String} key - Search key
     * @param {any} value - Search value
     * @param {any} newValue - New value to set
     * @return {Object}
     */
    async findOneAndUpdateByKeyValue(key, value, newValue) {
        let query = {};
        query[key] = value;
        let update = {};
        update[key] = newValue;
        let response = await this.getCollection().findOneAndUpdate(
            query,
            { $set: update },
            { returnOriginal: false }
        );
        return response;
    }

    async findAll(limit = 100, skip = 0, sort = {}) {
        return await this.getCollection().find().limit(limit).skip(skip).sort(sort).toArray();
    }

    /**
     * Insert a new object into the database
     * @param {Object} object - The object to insert
     * @return {Object}
     */
    async insert(object) {
        let response = await this.getCollection().insertOne(object);
        return response;
    }

    /**
     * Remove an object by _id
     * @param {String|ObjectId} id - The document id
     * @return {Object} Result of the delete operation
     */
    async removeById(id) {
        let objId = id;

        if (objId && typeof objId === 'string') {
            objId = ObjectId.createFromHexString(objId);
        }
        return await this.getCollection().deleteOne({
            _id: objId
        });
    }

    /**
     * Delete a document by _id (alias for removeById)
     * @param {String|ObjectId} id - The document id
     * @return {Promise<boolean>} True if deleted successfully
     */
    async deleteById(id) {
        const result = await this.removeById(id);
        return result.deletedCount > 0;
    }

    /**
     * Delete multiple documents by query
     * @param {Object} query - The delete query
     * @return {Object} Result of the delete operation
     */
    async deleteMany(query) {
        return await this.getCollection().deleteMany(query);
    }

    /**
     * Find documents by query
     * @param {Object} query - The find query
     * @return {Array} Result of the find operation
     */
    async find(query) {
        return await this.getCollection().find(query).toArray();
    }

    /**
     * Find document by _id
     * @param {String|ObjectId} id - The document id
     * @return {Object}
     */
    async findById(id) {
        let objId = id;
        if (objId && typeof objId === 'string') {
            try {
                objId = ObjectId.createFromHexString(objId);
            } catch (error) {
                // Invalid ObjectId format, return null
                return null;
            }
        }
        return await this.getCollection().findOne({
            _id: objId
        });
    }

    /**
     * Apply aggregate pipeline that should return object { count : Number }
     * @param {Array} pipeline - Aggregation pipeline
     * @return {Number}
     */
    async countByAggregate(pipeline) {
        let result = await this.getCollection().aggregate(pipeline).toArray();
        if (result && result.length && result[0].count) {
            return result[0].count;
        }
        return 0;
    }

    /**
     * Find documents by aggregate applying the given pipeline
     * @param {Array} pipeline - Aggregation pipeline
     * @return {Array}
     */
    async findByAggregate(pipeline) {
        let result = await this.getCollection().aggregate(pipeline).toArray();
        return result;
    }

    /**
     * Insert multiple documents
     * @param {Array} docs - Array of documents to insert
     * @return {Promise<Array>} of inserted IDs if successful
     */
    async insertMany(docs) {
        let result = await this.getCollection().insertMany(docs);
        return result.insertedIds;
    }

    async updateMany(filter, update) {
        let result = await this.getCollection().updateMany(filter, update);
        return result.modifiedCount;
    }

    /**
     * Atualiza múltiplos documentos por _id
     *
     * @param {Array} docs array de documentos com _id
     *
     * @return Object com resultado da operação
     */
    async updateBulk(docs) {
        if (!Array.isArray(docs) || docs.length === 0) {
            throw new Error(`Array de documentos [${this.name}] não pode ser vazio.`);
        }

        const bulkOps = docs.map(doc => {
            if (!doc._id) {
                throw new Error(`Documento [${this.name}] não possui o id para atualizar.`);
            }
            
            const _id = doc._id;
            const updateDoc = { ...doc };
            delete updateDoc._id;
            
            return {
                updateOne: {
                    filter: { _id },
                    update: { $set: updateDoc }
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

/**
 * Example usage:
 * 
 * // Before (function-based):
 * import crudApi from './crudApi.js';
 * const userCrud = crudApi('users');
 * const users = await userCrud.findByKeyValue('status', 'active');
 * 
 * // After (class-based):
 * import CrudApi from './crudApi.js';
 * const userCrud = new CrudApi('users');
 * const users = await userCrud.findByKeyValue('status', 'active');
 */
