import { ObjectId } from 'mongodb';

function formatDateToLocalDateString(date: Date): string {
  return date.toLocaleDateString('sv-SE');
}

export function transformMongoIds(doc: unknown): unknown {
  if (Array.isArray(doc)) {
    return doc.map(transformMongoIds);
  }

  if (doc && typeof doc === 'object') {
    if (doc instanceof ObjectId) {
      return doc.toString();
    }
    
    if (doc instanceof Date) {
      return formatDateToLocalDateString(doc);
    }

    const source = doc as Record<string, unknown>;
    const newObj: Record<string, unknown> = {};

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const value = source[key];

        if (value instanceof ObjectId) {
          if (key === '_id') {
            newObj['id'] = value.toString();
          } else {
            newObj[key] = value.toString();
          }
        } else if (value instanceof Date) {
          newObj[key] = formatDateToLocalDateString(value);
        } else if (value && typeof value === 'object') {
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
