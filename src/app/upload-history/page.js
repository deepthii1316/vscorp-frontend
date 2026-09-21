'use client';

import { useState, useEffect } from 'react';
import UploadHistory from '@/components/UploadHistory';
import RequireAuth from '@/components/RequireAuth';

function UploadHistoryPage() {
  const [uploads, setUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);

  useEffect(() => {
    loadUploads();
  }, []);

  const loadUploads = async () => {
    try {
      setUploadsLoading(true);
      const response = await fetch('/api/upload-history');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setUploads(result.uploads || []);
    } catch (err) {
      console.error('Failed to load upload history:', err);
      setUploads([]);
    } finally {
      setUploadsLoading(false);
    }
  };

  return (
    <div className="page-content">
      <UploadHistory uploads={uploads} loading={uploadsLoading} />
    </div>
  );
}

export default function UploadHistoryPageWrapped() {
  return (
    <RequireAuth>
      <UploadHistoryPage />
    </RequireAuth>
  );
}
