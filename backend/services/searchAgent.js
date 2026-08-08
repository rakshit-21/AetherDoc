import { db } from '../db.js';
import { aiService } from './ai.js';
import { qdrantService } from './qdrantService.js';

// Vector Dot Product (since our embeddings are L2 normalized, dot product = cosine similarity)
const dotProduct = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  return vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
};

export const searchAgent = {
  // 1. Semantic Search (with Qdrant + local fallback)
  search: async (query, filters = {}, user) => {
    db.logActivity(user, query, 'SearchAgent', 'Started', `Executing search query: "${query}" with filters: ${JSON.stringify(filters)}`);

    try {
      // Generate query embedding
      const queryEmbedding = await aiService.generateEmbedding(query);
      const limit = filters.limit || 5;
      const docIdsFilter = filters.docIds || null;

      // 1. Attempt Qdrant Semantic Search
      const searchType = filters.type || 'hybrid'; // semantic, keyword, hybrid
      let qdrantResults = null;

      if (searchType !== 'keyword') {
        try {
          qdrantResults = await qdrantService.searchChunks(queryEmbedding, limit, docIdsFilter);
        } catch (err) {
          console.error('Qdrant search error, will fallback:', err.message);
        }
      }

      // If Qdrant search succeeded and returned results, use them!
      if (qdrantResults !== null) {
        db.logActivity(user, query, 'SearchAgent', 'Success', `Found ${qdrantResults.length} chunks via Qdrant Vector DB`);
        
        // Apply hybrid keyword boost if requested
        if (searchType === 'hybrid') {
          const queryLower = query.toLowerCase();
          qdrantResults = qdrantResults.map(c => {
            const containsKeyword = c.text.toLowerCase().includes(queryLower);
            return {
              ...c,
              score: c.score + (containsKeyword ? 0.15 : 0)
            };
          }).sort((a, b) => b.score - a.score);
        }

        return qdrantResults;
      }

      // 2. Local Fallback Database Search
      console.log('⚠️ Running in-memory local fallback vector search');
      const allDocs = db.getDocuments();
      const allChunks = db.getChunks();
      
      let eligibleDocs = allDocs;
      if (filters.category) {
        eligibleDocs = eligibleDocs.filter(d => d.category.toLowerCase() === filters.category.toLowerCase());
      }
      if (filters.tag) {
        eligibleDocs = eligibleDocs.filter(d => d.tags.some(t => t.toLowerCase() === filters.tag.toLowerCase()));
      }
      if (docIdsFilter && docIdsFilter.length > 0) {
        eligibleDocs = eligibleDocs.filter(d => docIdsFilter.includes(d.id));
      }

      const eligibleDocIds = new Set(eligibleDocs.map(d => d.id));
      let eligibleChunks = allChunks.filter(c => eligibleDocIds.has(c.docId));

      let rankedChunks = [];
      if (searchType === 'keyword' || !query.trim()) {
        const queryLower = query.toLowerCase();
        rankedChunks = eligibleChunks
          .map(c => {
            const occurrences = (c.text.toLowerCase().match(new RegExp(queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
            return {
              chunk: c,
              score: occurrences > 0 ? 0.5 + (occurrences * 0.1) : 0
            };
          })
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .map(item => ({ ...item.chunk, score: item.score }));
      } else if (searchType === 'semantic') {
        rankedChunks = eligibleChunks
          .map(c => {
            const similarity = dotProduct(queryEmbedding, c.embedding);
            return {
              chunk: c,
              score: similarity
            };
          })
          .sort((a, b) => b.score - a.score)
          .map(item => ({ ...item.chunk, score: item.score }));
      } else {
        const queryLower = query.toLowerCase();
        rankedChunks = eligibleChunks
          .map(c => {
            const semanticScore = dotProduct(queryEmbedding, c.embedding);
            const containsKeyword = c.text.toLowerCase().includes(queryLower);
            const hybridScore = semanticScore + (containsKeyword ? 0.15 : 0);
            return {
              chunk: c,
              score: hybridScore
            };
          })
          .sort((a, b) => b.score - a.score)
          .map(item => ({ ...item.chunk, score: item.score }));
      }

      const results = rankedChunks.slice(0, limit);
      db.logActivity(user, query, 'SearchAgent', 'Success', `Found ${results.length} relevant chunks via fallback search`);
      return results;
    } catch (err) {
      db.logActivity(user, query, 'SearchAgent', 'Failed', `Search error: ${err.message}`);
      throw err;
    }
  },

  // 2. RAG Q&A (chatting with documents)
  askQuestion: async (query, docIds, user) => {
    db.logActivity(user, query, 'SearchAgent', 'Started', `Answering question for documents: [${docIds ? docIds.join(', ') : 'All'}]`);

    try {
      // 1. Retrieve relevant chunks using search
      const matchedChunks = await searchAgent.search(query, { limit: 5, type: 'hybrid', docIds }, user);

      if (matchedChunks.length === 0) {
        db.logActivity(user, query, 'SearchAgent', 'Success', 'No relevant chunks found to answer query');
        return {
          answer: "I could not find any relevant information in the selected documents to answer your question.",
          citations: []
        };
      }

      // 2. Call AI service to generate answer based on retrieved contexts
      const answer = await aiService.answerQuestion(query, matchedChunks);
      db.logActivity(user, query, 'SearchAgent', 'Success', `Generated RAG response citing ${matchedChunks.length} sources`);

      return {
        answer,
        citations: matchedChunks.map(c => ({
          docId: c.docId,
          docName: c.docName,
          chunkIndex: c.index,
          textSnippet: c.text.substring(0, 100) + '...'
        }))
      };
    } catch (err) {
      db.logActivity(user, query, 'SearchAgent', 'Failed', `RAG error: ${err.message}`);
      throw err;
    }
  }
};
