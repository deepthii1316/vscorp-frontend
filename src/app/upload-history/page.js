'use client';

import { useState, useEffect } from 'react';
import UploadHistory from '@/components/UploadHistory';
import RequireAuth from '@/components/RequireAuth';
import { createBrowserClient } from '@/lib/supabase';

function UploadHistoryPage() {
  const [uploads, setUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);

  useEffect(() => {
    loadUploads();
  }, []);

  const loadUploads = async () => {
    try {
      setUploadsLoading(true);
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('upload_audit_log')
        .select('*')
        .order('uploaded_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Failed to load upload history:', error);
        setUploads([]);
      } else {
        setUploads(data || []);
      }
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
