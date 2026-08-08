import React, { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, Send, Sparkles, Sliders, FileText } from 'lucide-react';
import { API_BASE } from '../config';

export default function SearchChat({ token, triggerAgentAction, onLogout }) {
  // Search tab states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('hybrid');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Chat tab states
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatting, setChatting] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [allDocs, setAllDocs] = useState([]);

  const messagesEndRef = useRef(null);

  const fetchDocs = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setAllDocs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [token]);

  useEffect(() => {
    // Scroll chat messages to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    // Trigger agent visualizations (Coordinator routing -> Search Agent execution)
    triggerAgentAction('search', 'Coordinator');
    await new Promise(r => setTimeout(r, 800));
    triggerAgentAction('search', 'Search');

    try {
      const response = await fetch(`${API_BASE}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          query: searchQuery,
          type: searchType,
          category: categoryFilter || undefined,
          limit: 5
        })
      });

      if (response.status === 401) {
        onLogout();
        return;
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search request failed');
      setSearchResults(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setSearching(false);
      triggerAgentAction(null, null);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatQuery.trim()) return;

    const userMsg = { role: 'user', text: chatQuery };
    setChatHistory(prev => [...prev, userMsg]);
    const currentQuery = chatQuery;
    setChatQuery('');
    setChatting(true);

    // Trigger agent visualizations (Coordinator routing -> Search Agent RAG execution)
    triggerAgentAction('chat', 'Coordinator');
    await new Promise(r => setTimeout(r, 800));
    triggerAgentAction('chat', 'Search');

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          query: currentQuery,
          docIds: selectedDocs.length > 0 ? selectedDocs : undefined
        })
      });

      if (response.status === 401) {
        onLogout();
        return;
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Q&A request failed');

      const agentMsg = {
        role: 'agent',
        text: data.answer,
        citations: data.citations
      };
      setChatHistory(prev => [...prev, agentMsg]);
    } catch (err) {
      const errorMsg = { role: 'agent', text: `Failed to generate answer: ${err.message}` };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setChatting(false);
      triggerAgentAction(null, null);
    }
  };

  const toggleDocSelection = (docId) => {
    setSelectedDocs(prev =>
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      {/* Left Column: Semantic Search */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3>Semantic Vector Explorer</h3>
          <button 
            className="btn btn-secondary" 
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Sliders size={14} /> Filters
          </button>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Search keywords or semantic concepts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="btn" disabled={searching}>
            <Search size={16} />
          </button>
        </form>

        {showFilters && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-glass)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            gap: '1rem'
          }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Search Engine Mode</label>
              <select
                className="input-field"
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                style={{ padding: '0.5rem', fontSize: '0.85rem', background: 'var(--bg-secondary)' }}
              >
                <option value="hybrid">Hybrid Search (Vector + Keyword)</option>
                <option value="semantic">Semantic Only (Cosine Embeddings)</option>
                <option value="keyword">Keyword Only (Exact Matches)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Category Filter</label>
              <select
                className="input-field"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ padding: '0.5rem', fontSize: '0.85rem', background: 'var(--bg-secondary)' }}
              >
                <option value="">All Categories</option>
                <option value="agreement">Agreement</option>
                <option value="invoice">Invoice</option>
                <option value="policy">Policy</option>
                <option value="manual">Manual</option>
                <option value="report">Report</option>
              </select>
            </div>
          </div>
        )}

        <div style={{ flexGrow: 1, overflowY: 'auto', maxHeight: '420px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {searching ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Querying vector databases...</p>
          ) : searchResults.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
              No matches found. Enter a prompt to search relevant document chunks.
            </p>
          ) : (
            searchResults.map((res, i) => (
              <div 
                key={res.id || i} 
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '1rem',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--primary)' }}>
                    <FileText size={14} />
                    <span>{res.docName} [Chunk {res.index}]</span>
                  </div>
                  {res.score !== undefined && (
                    <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                      Match: {(res.score * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}>
                  "{res.text}"
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Chat with Document (RAG) */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <MessageSquare size={20} color="var(--primary)" />
          Contextual RAG Chat Assistant
        </h3>

        {/* Selected Documents Checklist */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
            Constrain RAG Context (Optional):
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '80px', overflowY: 'auto', padding: '0.25rem' }}>
            {allDocs.map(doc => (
              <button
                key={doc.id}
                onClick={() => toggleDocSelection(doc.id)}
                style={{
                  padding: '0.3rem 0.6rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  border: `1px solid ${selectedDocs.includes(doc.id) ? 'var(--primary)' : 'var(--border-glass)'}`,
                  background: selectedDocs.includes(doc.id) ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  color: selectedDocs.includes(doc.id) ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)'
                }}
              >
                {doc.name}
              </button>
            ))}
            {allDocs.length === 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No documents indexed yet.</span>
            )}
          </div>
        </div>

        {/* Chat Messages */}
        <div className="chat-container">
          <div className="chat-messages">
            {chatHistory.length === 0 && (
              <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '300px', color: 'var(--text-muted)' }}>
                <Sparkles size={28} color="var(--primary)" style={{ margin: '0 auto 1rem' }} />
                <p style={{ fontSize: '0.9rem' }}>Ask questions relative to the content indexed in the document management platform.</p>
              </div>
            )}

            {chatHistory.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                <div>{msg.text}</div>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="chat-citations">
                    <strong>Retrieved References:</strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem' }}>
                      {msg.citations.map((cit, idx) => (
                        <div key={idx}>
                          • {cit.docName} (Segment {cit.chunkIndex})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {chatting && (
              <div className="chat-message agent">
                <span style={{ display: 'inline-flex', gap: '0.25rem' }}>
                  <span style={{ animation: 'pulse-border 1.2s infinite alternate', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                  <span style={{ animation: 'pulse-border 1.2s infinite alternate 0.3s', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                  <span style={{ animation: 'pulse-border 1.2s infinite alternate 0.6s', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="chat-input-area">
            <input
              type="text"
              className="input-field"
              placeholder="Ask anything about the documents..."
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              disabled={chatting}
            />
            <button type="submit" className="btn" disabled={chatting || !chatQuery.trim()}>
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
