'use client';

import { useState, useRef } from 'react';

export default function UploadZone({ onSuccess }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['json', 'zip'].includes(ext)) {
      setError('Only JSON and ZIP files are supported');
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        if (onSuccess) onSuccess(data);
      }
    } catch (e) {
      setError('Upload failed: ' + e.message);
    }
    setUploading(false);
  }

  return (
    <div className="upload-zone-wrapper">
      <div
        className={`upload-zone ${dragging ? 'active' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
      >
        <div className="upload-icon">{uploading ? '⏳' : '📁'}</div>
        <div className="upload-text">
          {uploading ? 'Parsing file...' : 'Drop your Instagram export file here'}
        </div>
        <div className="upload-hint">JSON or ZIP from Instagram data download</div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.zip"
        style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])}
      />

      {error && <div className="upload-error">❌ {error}</div>}
      
      {result && (
        <div className="upload-success">
          ✅ Parsed <strong>{result.parsed}</strong> usernames — 
          <strong>{result.added}</strong> new added
          {result.alreadyExisted > 0 && `, ${result.alreadyExisted} already existed`}
        </div>
      )}
    </div>
  );
}
