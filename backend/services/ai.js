import { GoogleGenerativeAI } from '@google/generative-ai';
import '../dotenv-config.js';

const apiKey = process.env.GEMINI_API_KEY;
let aiClient = null;

if (apiKey) {
  try {
    aiClient = new GoogleGenerativeAI(apiKey);
    console.log('Gemini AI Client initialized successfully using GoogleGenerativeAI.');
  } catch (err) {
    console.error('Error initializing Gemini client:', err);
  }
} else {
  console.log('No GEMINI_API_KEY found. Running in Local Intelligent Simulation Mode.');
}

// Local simulation helper functions for NLP
const extractKeywords = (text) => {
  const stopwords = new Set(['the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'to', 'in', 'for', 'of', 'or', 'by', 'with', 'this', 'that', 'it', 'from', 'as', 'are', 'was', 'were', 'be']);
  const cleanText = text.toLowerCase().replace(/[^\w\s]/g, '');
  const words = cleanText.split(/\s+/);
  const freq = {};
  words.forEach(w => {
    if (w.length > 3 && !stopwords.has(w)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(entry => entry[0]);
};

const createMockEmbedding = (text) => {
  // Vocabulary for mock embedding space (128 dimensions)
  const vocab = [
    'agreement', 'contract', 'invoice', 'report', 'policy', 'user', 'security', 'role', 'access', 'encrypt',
    'decrypt', 'key', 'auth', 'token', 'admin', 'editor', 'viewer', 'document', 'search', 'find', 'process',
    'coordinate', 'agent', 'workflow', 'database', 'system', 'privacy', 'data', 'cloud', 'service',
    'finance', 'payment', 'company', 'client', 'server', 'client', 'api', 'compliance', 'legal', 'law',
    'term', 'condition', 'date', 'price', 'cost', 'total', 'tax', 'summary', 'metadata', 'ai', 'model',
    'vector', 'semantic', 'query', 'response', 'prompt', 'chat', 'assistant', 'verify', 'checksum', 'sha256',
    'aes256', 'hash', 'signature', 'password', 'login', 'signup', 'register', 'dashboard', 'file', 'upload',
    'pdf', 'docx', 'txt', 'image', 'ocr', 'tesseract', 'scan', 'text', 'parse', 'extract', 'compare',
    'version', 'diff', 'audit', 'log', 'activity', 'time', 'date', 'history', 'change', 'update', 'modify',
    'delete', 'create', 'view', 'read', 'write', 'execute', 'permission', 'rbac', 'jwt', 'verify',
    'enterprise', 'platform', 'management', 'ai-powered', 'agentic', 'architecture', 'orchestrate', 'decision',
    'intent', 'specialized', 'retrieve', 'rag', 'citation', 'source', 'chunk', 'integrity', 'failure', 'success'
  ];

  const vector = new Array(vocab.length).fill(0.01); // baseline
  const words = text.toLowerCase().split(/\W+/);
  words.forEach(w => {
    const idx = vocab.indexOf(w);
    if (idx !== -1) {
      vector[idx] += 1.0;
    }
  });

  // L2 Normalize the vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map(val => val / (magnitude || 1));
};

export const aiService = {
  isSimulated: () => !aiClient,

  // 1. Generate text embeddings (vector space representation)
  generateEmbedding: async (text) => {
    if (aiClient) {
      try {
        const model = aiClient.getGenerativeModel({ model: 'gemini-embedding-001' });
        const response = await model.embedContent(text);
        if (response && response.embedding) {
          return response.embedding.values;
        }
      } catch (err) {
        console.error('Gemini embedding failed, falling back to simulated:', err.message);
      }
    }
    return createMockEmbedding(text);
  },

  // 2. Generate summary, tags, and category for a document
  analyzeDocument: async (text, filename) => {
    if (aiClient) {
      try {
        const prompt = `You are a document processing AI agent. Analyze the following document text and provide:
1. A concise, professional summary (3-4 sentences).
2. A document category (e.g. Agreement, Invoice, Policy, Manual, Report, Other).
3. A list of 4-6 keywords/tags.

Output MUST be a strict JSON object with this format:
{
  "summary": "...",
  "category": "...",
  "tags": ["...", "..."]
}

Document File Name: ${filename}
Document Text:
${text.substring(0, 6000)}`;

        const model = aiClient.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const response = await model.generateContent(prompt);
        const responseText = response.response.text();
        // Parse JSON from code blocks if necessary
        const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
      } catch (err) {
        console.error('Gemini document analysis failed, falling back to simulated:', err.message);
      }
    }

    // Local simulation fallback
    const summary = text.length > 250 
      ? text.substring(0, 250).trim() + '...' 
      : text.trim() || 'Empty document.';
      
    // Simple category detector
    let category = 'Report';
    const lowerText = text.toLowerCase();
    if (lowerText.includes('agreement') || lowerText.includes('contract') || lowerText.includes('lease')) {
      category = 'Agreement';
    } else if (lowerText.includes('invoice') || lowerText.includes('receipt') || lowerText.includes('bill') || lowerText.includes('total due')) {
      category = 'Invoice';
    } else if (lowerText.includes('policy') || lowerText.includes('terms') || lowerText.includes('privacy')) {
      category = 'Policy';
    } else if (lowerText.includes('manual') || lowerText.includes('guide') || lowerText.includes('how to')) {
      category = 'Manual';
    }

    const tags = extractKeywords(text);
    if (!tags.includes(category.toLowerCase())) {
      tags.push(category.toLowerCase());
    }

    return {
      summary,
      category,
      tags
    };
  },

  // 3. Question Answering (RAG)
  answerQuestion: async (query, chunks) => {
    const contextText = chunks
      .map((c, i) => `[Source ${i + 1}] (File: ${c.docName}, Chunk ${c.index}):\n${c.text}`)
      .join('\n\n');

    if (aiClient) {
      try {
        const prompt = `You are a Retrieval-Augmented Generation (RAG) agent. Answer the user's query based ONLY on the provided document chunks.
If the answer cannot be found in the context, say "I cannot find the answer in the provided documents."
Cite your sources clearly using [Source X] format.

Context Chunks:
${contextText}

User Query: ${query}`;

        const model = aiClient.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const response = await model.generateContent(prompt);
        return response.response.text();
      } catch (err) {
        console.error('Gemini RAG failed, falling back to simulated:', err.message);
      }
    }

    // Simulated RAG engine
    if (chunks.length === 0) {
      return "I could not find any relevant documents to answer your question.";
    }

    const citations = chunks.map((c, i) => `[Source ${i + 1}] (${c.docName})`);
    const answer = `Based on the retrieved context, here is what I found:\n\n` + 
      chunks.map((c, i) => `• From ${citations[i]}: "${c.text.substring(0, 150)}..."`).join('\n\n') +
      `\n\n[System Note: This answer is running in simulated agent mode because no Gemini API Key is configured.]`;

    return answer;
  },

  // 4. Classify query intent for Coordinator Agent routing
  classifyIntent: async (query) => {
    if (aiClient) {
      try {
        const prompt = `You are a Coordinator Agent routing requests. Classify the user's query intent as either:
1. "search": The user is trying to find, search, locate, or list relevant snippets or documents.
2. "chat": The user is asking a question, seeking an explanation, or chatting with the documents.

Output MUST be a strict JSON object with this format:
{
  "intent": "search" | "chat"
}

User Query: ${query}`;

        const model = aiClient.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const response = await model.generateContent(prompt);
        const responseText = response.response.text();
        const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson).intent;
      } catch (err) {
        console.error('Gemini intent classification failed, falling back:', err.message);
      }
    }

    // Heuristics fallback
    const queryLower = query.toLowerCase();
    if (queryLower.includes('search') || queryLower.includes('find') || queryLower.includes('lookup') || queryLower.includes('retrieve') || queryLower.includes('list')) {
      return 'search';
    }
    return 'chat';
  }
};
