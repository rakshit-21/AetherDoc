import { processingAgent } from './processingAgent.js';
import { searchAgent } from './searchAgent.js';
import { db } from '../db.js';
import { aiService } from './ai.js';
import fs from 'fs';
import path from 'path';

export const coordinatorAgent = {
  // Orchestrate Document Ingestion Workflow
  uploadDocument: async (file, user) => {
    db.logActivity(user.username, file.originalname, 'CoordinatorAgent', 'Started', `Received document upload request for: ${file.originalname}`);

    try {
      const docId = 'doc_' + Date.now();
      const fileBuffer = file.buffer;

      // 1. Delegate to Processing Agent (extract text, summarize, metadata, embeddings chunking, Qdrant indexing)
      const processedData = await processingAgent.process(docId, fileBuffer, file.originalname, file.mimetype, user.username);

      // 2. Save the clean extracted plain text to disk as a standard text file for reader viewing
      const uploadsDir = path.resolve('uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
      }
      const storagePath = path.join(uploadsDir, `${docId}.txt`);
      fs.writeFileSync(storagePath, processedData.content, 'utf-8');

      // 3. Create document DB entry with final processed metadata & summary
      const finalDoc = {
        id: docId,
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: storagePath,
        owner: user.username,
        uploadTime: new Date().toISOString(),
        status: 'Processed',
        category: processedData.category,
        summary: processedData.summary,
        tags: processedData.tags
      };
      
      db.createDocument(finalDoc);

      db.logActivity(user.username, file.originalname, 'CoordinatorAgent', 'Success', `Ingestion workflow completed for: ${file.originalname}`);
      return finalDoc;
    } catch (err) {
      db.logActivity(user.username, file.originalname, 'CoordinatorAgent', 'Failed', `Workflow failed: ${err.message}`);
      throw err;
    }
  },

  // Orchestrate Chat / Search via Intent Routing
  // Routes queries to the appropriate agent depending on classified intent
  routeQuery: async (query, docIds, user) => {
    db.logActivity(user.username, query, 'CoordinatorAgent', 'Started', 'Analyzing query intent...');

    // 1. Detect query intent
    const intent = await aiService.classifyIntent(query);
    
    db.logActivity(
      user.username,
      query,
      'CoordinatorAgent',
      'Routed',
      `Query classified as intent: "${intent}". Routing to ${intent === 'search' ? 'SearchAgent (Vector Semantic Retrieval)' : 'SearchAgent (RAG Chat Engine)'}.`
    );

    if (intent === 'search') {
      // Route query to Search Agent for semantic matching chunks retrieval
      const results = await searchAgent.search(query, { docIds, type: 'hybrid' }, user.username);
      return {
        intent: 'search',
        results
      };
    } else {
      // Route query to Search Agent RAG interface for context answering
      const results = await searchAgent.askQuestion(query, docIds, user.username);
      return {
        intent: 'chat',
        ...results
      };
    }
  }
};
