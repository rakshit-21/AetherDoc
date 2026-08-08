import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_FILE = path.resolve('data.json');

// Initialize database with structure and seed users if empty
const initDb = () => {
  if (!fs.existsSync(DB_FILE)) {
    const defaultDb = {
      users: [
        {
          id: 'u1',
          username: 'admin',
          passwordHash: bcrypt.hashSync('admin123', 8),
          role: 'Admin'
        },
        {
          id: 'u2',
          username: 'editor',
          passwordHash: bcrypt.hashSync('editor123', 8),
          role: 'Editor'
        },
        {
          id: 'u3',
          username: 'viewer',
          passwordHash: bcrypt.hashSync('viewer123', 8),
          role: 'Viewer'
        }
      ],
      documents: [],
      chunks: [],
      logs: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf-8');
  }
};

initDb();

const readDb = () => {
  try {
    initDb();
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database file:', err);
    return { users: [], documents: [], chunks: [], logs: [] };
  }
};

const writeDb = (data) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing database file:', err);
  }
};

export const db = {
  // User operations
  getUsers: () => readDb().users,
  getUserById: (id) => readDb().users.find(u => u.id === id),
  getUserByUsername: (username) => readDb().users.find(u => u.username.toLowerCase() === username.toLowerCase()),
  createUser: (user) => {
    const data = readDb();
    const newUser = { id: 'u_' + Date.now(), ...user };
    data.users.push(newUser);
    writeDb(data);
    return newUser;
  },

  // Document operations
  getDocuments: () => readDb().documents,
  getDocumentById: (id) => readDb().documents.find(d => d.id === id),
  createDocument: (doc) => {
    const data = readDb();
    data.documents.push(doc);
    writeDb(data);
    return doc;
  },
  updateDocument: (id, updates) => {
    const data = readDb();
    const index = data.documents.findIndex(d => d.id === id);
    if (index !== -1) {
      data.documents[index] = { ...data.documents[index], ...updates };
      writeDb(data);
      return data.documents[index];
    }
    return null;
  },
  deleteDocument: (id) => {
    const data = readDb();
    data.documents = data.documents.filter(d => d.id !== id);
    data.chunks = data.chunks.filter(c => c.docId !== id);
    writeDb(data);
  },

  // Chunk operations
  getChunks: () => readDb().chunks,
  getChunksByDocId: (docId) => readDb().chunks.filter(c => c.docId === docId),
  createChunks: (newChunks) => {
    const data = readDb();
    data.chunks = [...data.chunks, ...newChunks];
    writeDb(data);
    return newChunks;
  },

  // Activity log operations
  getLogs: () => readDb().logs,
  logActivity: (user, action, agent, status, details) => {
    const data = readDb();
    const newLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      user: user || 'System',
      action,
      agent,
      status,
      details
    };
    data.logs.push(newLog);
    // Keep logs size reasonable
    if (data.logs.length > 500) {
      data.logs = data.logs.slice(-500);
    }
    writeDb(data);
    return newLog;
  }
};
