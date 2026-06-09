/**
 * @typedef {Object} User
 * @property {string|null} _id - MongoDB ObjectId
 * @property {string} name - User full name
 * @property {string} email - User email address
 * @property {string|null} password - Hashed password for email auth
 * @property {string|null} phone - User phone number
 * @property {string|null} birthDate - Local date in YYYY-MM-DD format
 * @property {Date} createdAt - Account creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {Date|null} lastLogin - Last login timestamp
 * @property {string} provider - Auth provider
 * @property {string} accountStatus - Account status
 * @property {boolean} emailVerified - Email verification status
 * @property {boolean} isDevelopment - Development mode flag
 * @property {string} language - User language preference
 * @property {string|null} picture - Avatar URL
 */

export {};
