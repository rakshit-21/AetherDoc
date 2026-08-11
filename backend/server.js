import './dotenv-config.js';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

import { db } from './db.js';
import { securityAgent } from './services/securityAgent.js';
import { coordinatorAgent } from './services/coordinatorAgent.js';

const app = express();
const PORT = process.env.PORT || 5001;

// Enable CORS & JSON parsing
app.use(cors());
app.use(express.json());

// Set up Multer for memory storage file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Create uploads directory if not exists
const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// ================= AUTH ROUTES =================

app.post('/api/auth/signup', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const existing = db.getUserByUsername(username);
  if (existing) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  const passwordHash = bcrypt.hashSync(password, 8);
  const userRole = role || 'Viewer'; // Default to Viewer

  const user = db.createUser({
    username,
    passwordHash,
    role: userRole
  });

  const token = securityAgent.generateToken(user);
  db.logActivity(user.username, 'Signup', 'SecurityAgent', 'Success', `User signed up with role: ${user.role}`);

  res.status(201).json({
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    db.logActivity(username, 'Login', 'SecurityAgent', 'Failed', 'Invalid credentials');
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = securityAgent.generateToken(user);
  db.logActivity(user.username, 'Login', 'SecurityAgent', 'Success', `User logged in with role: ${user.role}`);

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
});

// ================= DOCUMENT MANAGEMENT ROUTES =================

app.post(
  '/api/documents/upload',
  securityAgent.authMiddleware,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      // Hand over to Coordinator Agent to run pipeline
      const doc = await coordinatorAgent.uploadDocument(req.file, req.user);
      res.status(201).json(doc);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get('/api/documents', securityAgent.authMiddleware, (req, res) => {
  const docs = db.getDocuments();
  res.json(docs);
});

// Retrieve file contents for viewing (kept decrypt endpoint name for frontend compatibility)
app.get(
  '/api/documents/:id/decrypt',
  securityAgent.authMiddleware,
  (req, res) => {
    const { id } = req.params;
    const doc = db.getDocumentById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    try {
      const filename = path.basename(doc.path);
      const docPath = path.join(uploadsDir, filename);

      if (!fs.existsSync(docPath)) {
        return res.status(404).json({ error: 'Document file missing from storage' });
      }

      // Read file content as-is (unencrypted)
      const buffer = fs.readFileSync(docPath);
      
      db.logActivity(
        req.user.username, 
        doc.name, 
        'CoordinatorAgent', 
        'Success', 
        `Retrieved file content`
      );

      res.json({
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        text: buffer.toString('utf-8')
      });
    } catch (err) {
      res.status(500).json({ error: `Reading file failed: ${err.message}` });
    }
  }
);

app.delete(
  '/api/documents/:id',
  securityAgent.authMiddleware,
  (req, res) => {
    const { id } = req.params;
    const doc = db.getDocumentById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    try {
      // Delete file from disk
      const filename = path.basename(doc.path);
      const docPath = path.join(uploadsDir, filename);
      if (fs.existsSync(docPath)) {
        fs.unlinkSync(docPath);
      }
      
      // Delete from DB and chunks
      db.deleteDocument(id);
      
      db.logActivity(req.user.username, doc.name, 'CoordinatorAgent', 'Success', `Deleted document and all text chunks`);
      res.json({ success: true, message: 'Document deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ================= AGENT WORKFLOW ROUTES =================

app.post('/api/search', securityAgent.authMiddleware, async (req, res) => {
  const { query, docIds } = req.body;
  try {
    const result = await coordinatorAgent.routeQuery(query || '', docIds, req.user);
    res.json(result.results || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', securityAgent.authMiddleware, async (req, res) => {
  const { query, docIds } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const result = await coordinatorAgent.routeQuery(query, docIds, req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Error Handler Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});


