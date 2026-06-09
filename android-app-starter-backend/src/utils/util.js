import { ObjectId } from 'mongodb';

function formatDateToLocalDateString(date) {
  return date.toLocaleDateString('sv-SE');
}

export function transformMongoIds(doc) {
  if (Array.isArray(doc)) {
    return doc.map(transformMongoIds);
  }

  if (doc && typeof doc === 'object') {
    // Handle ObjectId
    if (doc instanceof ObjectId) {
      return doc.toString();
    }
    
    // Handle Date - convert to a local YYYY-MM-DD string for frontend.
    if (doc instanceof Date) {
      return formatDateToLocalDateString(doc);
    }

    const newObj = {};

    for (const key in doc) {
      if (Object.prototype.hasOwnProperty.call(doc, key)) {
        const value = doc[key];

        if (value instanceof ObjectId) {
          if (key === '_id') {
            newObj['id'] = value.toString();
          } else {
            newObj[key] = value.toString();
          }
        } else if (value instanceof Date) {
          // Convert Date objects to a local YYYY-MM-DD string for frontend.
          newObj[key] = formatDateToLocalDateString(value);
        } else if (value && typeof value === 'object') {
          // Recursively transform nested objects and arrays
          newObj[key] = transformMongoIds(value);
        } else {
          newObj[key] = value;
        }
      }
    }

    return newObj;
  }

  return doc;
} 
