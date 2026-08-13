import dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || null;
const COLLECTION_NAME = 'document_chunks';

let isQdrantHealthy = false;
let lastHealthCheckTime = 0;
const HEALTH_CHECK_COOLDOWN = 60 * 1000; // 60 seconds

// Builds headers for every Qdrant request, attaching the API key when
// present (required for Qdrant Cloud, unnecessary/ignored for local Docker).
const buildHeaders = (extra = {}) => {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (QDRANT_API_KEY) {
    headers['api-key'] = QDRANT_API_KEY;
  }
  return headers;
};

// Check connectivity to Qdrant with short timeout and caching/cooldown
async function checkHealth() {
  const now = Date.now();
  if (now - lastHealthCheckTime < HEALTH_CHECK_COOLDOWN) {
    return isQdrantHealthy;
  }
  
  lastHealthCheckTime = now;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Cloud clusters are remote — give a bit more time than the old 1s local-only timeout
    
    const res = await fetch(`${QDRANT_URL}/healthz`, {
      signal: controller.signal,
      headers: buildHeaders()
    });
    clearTimeout(timeoutId);
    isQdrantHealthy = res.ok;
    return isQdrantHealthy;
  } catch (err) {
    console.error('Qdrant Health Check Failed:', err.message);
    isQdrantHealthy = false;
    return false;
  }
}

export const qdrantService = {
  isHealthy: async () => {
    return await checkHealth();
  },

  initCollection: async (vectorSize) => {
    if (!(await checkHealth())) {
      return false;
    }

    try {
      // Check if collection exists
      const checkRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        headers: buildHeaders()
      });
      if (checkRes.ok) {
        return true;
      }

      // Create collection if it doesn't exist
      console.log(`Creating Qdrant collection: "${COLLECTION_NAME}" with dimension ${vectorSize}...`);
      const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify({
          vectors: {
            size: vectorSize,
            distance: 'Cosine'
          }
        })
      });

      if (!createRes.ok) {
        const errData = await createRes.json();
        console.error('Failed to create Qdrant collection:', errData);
        return false;
      }

      console.log(`✅ Qdrant collection "${COLLECTION_NAME}" initialized successfully.`);
      return true;
    } catch (err) {
      console.error('Error initializing Qdrant collection:', err);
      return false;
    }
  },

  upsertChunks: async (chunks) => {
    if (!chunks || chunks.length === 0) return false;
    const vectorSize = chunks[0].embedding.length;
    
    const initialized = await qdrantService.initCollection(vectorSize);
    if (!initialized) {
      console.log('⚠️ Qdrant is not running. Embeddings will only be saved in the local memory DB.');
      return false;
    }

    try {
      const points = chunks.map((chunk) => {
        const numericId = Math.abs(hashCode(chunk.id));
        return {
          id: numericId,
          vector: chunk.embedding,
          payload: {
            id: chunk.id,
            docId: chunk.docId,
            docName: chunk.docName,
            index: chunk.index,
            text: chunk.text
          }
        };
      });

      const upsertRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`, {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify({ points })
      });

      if (!upsertRes.ok) {
        const errData = await upsertRes.json();
        console.error('Failed to upsert points to Qdrant:', errData);
        return false;
      }

      console.log(`✅ Successfully upserted ${chunks.length} chunks to Qdrant collection "${COLLECTION_NAME}".`);
      return true;
    } catch (err) {
      console.error('Error upserting chunks to Qdrant:', err);
      return false;
    }
  },

  searchChunks: async (queryEmbedding, limit = 5, docIdsFilter = null) => {
    if (!(await checkHealth())) {
      console.log('⚠️ Qdrant is not running. Performing local in-memory fallback semantic search.');
      return null;
    }

    try {
      const filterBody = {};
      if (docIdsFilter && docIdsFilter.length > 0) {
        filterBody.must = [
          {
            key: 'docId',
            match: {
              any: docIdsFilter
            }
          }
        ];
      }

      const searchRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          vector: queryEmbedding,
          limit,
          with_payload: true,
          filter: Object.keys(filterBody).length > 0 ? filterBody : undefined
        })
      });

      if (!searchRes.ok) {
        const errData = await searchRes.json();
        console.error('Qdrant search failed:', errData);
        return null;
      }

      const searchData = await searchRes.json();
      return searchData.result.map(point => ({
        id: point.payload.id,
        docId: point.payload.docId,
        docName: point.payload.docName,
        index: point.payload.index,
        text: point.payload.text,
        score: point.score
      }));
    } catch (err) {
      console.error('Error searching chunks in Qdrant:', err);
      return null;
    }
  },

  deleteDocChunks: async (docId) => {
    if (!(await checkHealth())) return false;

    try {
      const deleteRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          filter: {
            must: [
              {
                key: 'docId',
                match: {
                  value: docId
                }
              }
            ]
          }
        })
      });

      return deleteRes.ok;
    } catch (err) {
      console.error(`Error deleting chunks for docId ${docId} from Qdrant:`, err);
      return false;
    }
  }
};

// Deterministic string to hash function
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}
