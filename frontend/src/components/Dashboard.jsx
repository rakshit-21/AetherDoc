import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, Trash2, Eye, RefreshCw, EyeOff } from 'lucide-react';
import { API_BASE } from '../config';

export default function Dashboard({ token, user, triggerAgentAction, onLogout }) {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Document viewer modal state
  const [viewingDoc, setViewingDoc] = useState(null);
  const [docText, setDocText] = useState('');
  const [loadingText, setLoadingText] = useState(false);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) throw new Error('Failed to load documents');
      const data = await response.json();
      setDocuments(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [token]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError('');

    // Animate workflow nodes (Coordinator -> Processing)
    triggerAgentAction('upload', 'Coordinator');
    await new Promise(r => setTimeout(r, 1000));
    triggerAgentAction('upload', 'Processing');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/api/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload document');
      }

      setDocuments(prev => [data, ...prev]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      triggerAgentAction(null, null);
    }
  };

  const handleViewDocument = async (docId) => {
    setLoadingText(true);
    setViewingDoc(docId);
    setDocText('');

    try {
      const response = await fetch(`${API_BASE}/api/documents/${docId}/decrypt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to retrieve document content');

      setDocText(data.text);
    } catch (err) {
      setError(err.message);
      setViewingDoc(null);
    } finally {
      setLoadingText(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;

    try {
      const response = await fetch(`${API_BASE}/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete document');

      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Upload Zone */}
      <div className="glass-card" style={{ padding: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Ingest Document</h3>
        <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Supported formats: PDF, DOCX, TXT (Includes automatic parsing, AI summary & metadata cataloging)
        </p>
        <label className="upload-zone" style={{ display: 'block' }}>
          <input 
            type="file" 
            style={{ display: 'none' }} 
            onChange={handleFileUpload} 
            disabled={uploading} 
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <UploadCloud size={48} color={uploading ? "var(--primary)" : "var(--text-muted)"} style={{ animation: uploading ? 'pulse-border 1.5s infinite' : 'none' }} />
            <div>
              <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Click to upload</span> or drag and drop
              <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>Max file size 10MB</p>
            </div>
          </div>
        </label>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          color: '#f87171',
          fontSize: '0.9rem'
        }}>
          {error}
        </div>
      )}

      {/* Documents Grid / Table */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Repository Index</h3>
          <button className="btn btn-secondary" onClick={fetchDocuments} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Querying metadata catalogs...</p>
        ) : documents.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            No documents uploaded yet.
          </p>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Owner</th>
                  <th>Category</th>
                  <th>Summary Preview</th>
                  <th>Created At</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FileText size={20} color="var(--primary)" />
                        <div>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{doc.name}</strong>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(doc.size / 1024).toFixed(1)} KB | {doc.status}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.9rem' }}>{doc.owner}</td>
                    <td>
                      <span className="badge badge-success" style={{ textTransform: 'capitalize' }}>
                        {doc.category}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.summary || 'None'}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {new Date(doc.uploadTime).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleViewDocument(doc.id)}
                          style={{ padding: '0.5rem', borderRadius: '6px' }}
                          title="View Content"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          className="btn btn-secondary btn-danger" 
                          onClick={() => handleDelete(doc.id)}
                          style={{ padding: '0.5rem', borderRadius: '6px' }}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Modal */}
      {viewingDoc && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '800px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h2>Document Text Reader</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  View extracted content and AI generated summaries
                </p>
              </div>
              <button className="btn btn-secondary" onClick={() => setViewingDoc(null)}>
                <EyeOff size={16} /> Close View
              </button>
            </div>

            {loadingText ? (
              <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                Loading extracted text stream...
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
                {/* AI Extracted Summary & Tags */}
                {documents.find(d => d.id === viewingDoc) && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '1rem'
                  }}>
                    <h4 style={{ color: 'var(--primary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>AI Agent Summary</h4>
                    <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                      {documents.find(d => d.id === viewingDoc).summary || 'Summary processing...'}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {documents.find(d => d.id === viewingDoc).tags.map(t => (
                        <span key={t} className="badge badge-secondary" style={{ background: 'rgba(255, 255, 255, 0.05)', fontSize: '0.7rem' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Text Content */}
                <div>
                  <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Extracted Text:</h4>
                  <pre style={{
                    background: '#05070c',
                    padding: '1.25rem',
                    borderRadius: '8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '300px',
                    border: '1px solid var(--border-glass)'
                  }}>
                    {docText}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
