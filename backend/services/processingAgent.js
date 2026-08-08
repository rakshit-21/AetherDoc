import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { pdfToPng } from 'pdf-to-png-converter';
import { aiService } from './ai.js';
import { db } from '../db.js';
import { qdrantService } from './qdrantService.js';

export const processingAgent = {
  // Sanitizes text to remove XML metadata blocks and binary garbage streams
  cleanExtractedText: (text) => {
    if (!text) return '';

    // 1. Remove xpacket / XML metadata containers commonly leaking from scanned PDF attachments
    let cleaned = text.replace(/<\?xpacket[\s\S]*?\?>/gi, '');
    cleaned = cleaned.replace(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/gi, '');
    cleaned = cleaned.replace(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/gi, '');

    // 2. Split into lines and filter out binary/garbage lines based on corruption ratio
    const lines = cleaned.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true; // keep spacing/linebreaks

      let badCharCount = 0;
      for (let i = 0; i < line.length; i++) {
        const charCode = line.charCodeAt(i);
        const char = line.charAt(i);
        const isReplacementChar = char === '\uFFFD';
        const isControlChar = (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) || charCode === 127;
        
        if (isReplacementChar || isControlChar) {
          badCharCount++;
        }
      }

      // If more than 15% of the line contains invalid or replacement characters, drop it
      const badRatio = badCharCount / line.length;
      return badRatio < 0.15;
    });

    return filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  },

  // 1. Core parsing method based on file format
  parseDocument: async (fileBuffer, filename, mimeType) => {
    let text = '';
    const nameLower = filename.toLowerCase();
    
    // PDF Parsing
    if (mimeType === 'application/pdf' || nameLower.endsWith('.pdf')) {
      try {
        const data = await pdfParse(fileBuffer);
        text = data.text;

        // Fallback to OCR if extracted text is empty or too short (scanned PDF)
        if (!text || text.trim().length < 100) {
          console.log('⚠️ PDF text is empty or too short. Attempting OCR fallback...');
          const pngPages = await pdfToPng(fileBuffer, {
            viewportScale: 2.0
          });
          
          let ocrText = '';
          const worker = await createWorker('eng');
          for (const page of pngPages) {
            if (page.kind === 'content') {
              const { data: { text: pageText } } = await worker.recognize(page.content);
              ocrText += pageText + '\n';
            }
          }
          await worker.terminate();
          text = ocrText;
        }
      } catch (err) {
        console.error('Error parsing PDF:', err);
        throw new Error('Failed to parse PDF file');
      }
    } 
    // DOCX Parsing
    else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || nameLower.endsWith('.docx')) {
      try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        text = result.value;
      } catch (err) {
        console.error('Error parsing DOCX:', err);
        throw new Error('Failed to parse DOCX file');
      }
    } 
    // TXT Parsing
    else if (mimeType === 'text/plain' || nameLower.endsWith('.txt')) {
      text = fileBuffer.toString('utf-8');
    } 
    // Image Parsing (OCR)
    else if (mimeType.startsWith('image/') || nameLower.endsWith('.png') || nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')) {
      try {
        console.log('📷 Image file detected. Performing OCR...');
        const worker = await createWorker('eng');
        const { data: { text: ocrText } } = await worker.recognize(fileBuffer);
        await worker.terminate();
        text = ocrText;
      } catch (err) {
        console.error('Error performing OCR on image:', err);
        throw new Error('Failed to perform OCR on image file');
      }
    }
    // Default fallback
    else {
      text = fileBuffer.toString('utf-8');
    }

    // Clean text of binary bytes, XMP metadata headers and replacement blocks
    text = processingAgent.cleanExtractedText(text);

    if (!text || text.trim().length === 0) {
      throw new Error('Document content is empty or contains only unextractable binary data.');
    }

    return text;
  },

  // 2. Text chunking (800 character size, 150 overlap)
  chunkText: (text, chunkSize = 800, overlap = 150) => {
    const chunks = [];
    let i = 0;
    
    while (i < text.length) {
      // Find a clean break (space or newline) if possible near the chunk boundary
      let end = i + chunkSize;
      if (end < text.length) {
        const nextSpace = text.indexOf(' ', end);
        const nextNewline = text.indexOf('\n', end);
        const bestEnd = Math.min(
          nextSpace !== -1 ? nextSpace : end,
          nextNewline !== -1 ? nextNewline : end
        );
        // Only extend chunk if it doesn't make it excessively large
        if (bestEnd - i < chunkSize + 100) {
          end = bestEnd;
        }
      } else {
        end = text.length;
      }
      
      const chunkText = text.substring(i, end).trim();
      if (chunkText.length > 20) { // skip tiny fragments
        chunks.push(chunkText);
      }
      
      i = end - overlap;
      if (i < 0) i = 0;
      if (end >= text.length) break;
    }
    
    // If no chunks were created but text is present, push the whole text
    if (chunks.length === 0 && text.trim().length > 0) {
      chunks.push(text.trim());
    }
    
    return chunks;
  },

  // 3. Full Document Processing Pipeline
  process: async (docId, fileBuffer, filename, mimeType, owner) => {
    db.logActivity(owner, filename, 'ProcessingAgent', 'Started', `Parsing file ${filename} of type ${mimeType}`);
    
    try {
      // Parse file contents
      const fullText = await processingAgent.parseDocument(fileBuffer, filename, mimeType);
      
      // Analyze with AI (extract summary & metadata)
      db.logActivity(owner, filename, 'ProcessingAgent', 'In Progress', `Analyzing metadata & creating summary`);
      const { summary, category, tags } = await aiService.analyzeDocument(fullText, filename);
      
      // Chunk document text
      const rawChunks = processingAgent.chunkText(fullText);
      db.logActivity(owner, filename, 'ProcessingAgent', 'In Progress', `Chunked document into ${rawChunks.length} segments`);
      
      // Generate embeddings and store chunks
      const processedChunks = [];
      for (let index = 0; index < rawChunks.length; index++) {
        const text = rawChunks[index];
        const embedding = await aiService.generateEmbedding(text);
        processedChunks.push({
          id: `chunk_${docId}_${index}`,
          docId,
          docName: filename,
          index,
          text,
          embedding
        });
      }
      
      // Store all chunks in the DB
      db.createChunks(processedChunks);

      // Index in Qdrant Vector DB
      try {
        await qdrantService.upsertChunks(processedChunks);
      } catch (qdrantErr) {
        console.error('Qdrant indexing failed, continuing with in-memory DB:', qdrantErr.message);
      }
      
      db.logActivity(owner, filename, 'ProcessingAgent', 'Success', `Completed parsing, chunking, and embedding generation`);
      
      return {
        content: fullText,
        summary,
        category,
        tags,
        chunkCount: rawChunks.length
      };
    } catch (err) {
      db.logActivity(owner, filename, 'ProcessingAgent', 'Failed', `Error during processing: ${err.message}`);
      throw err;
    }
  }
};
