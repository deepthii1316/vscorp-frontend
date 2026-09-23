'use client';

import DataCoverageMatrix from '@/components/DataCoverageMatrix';
import RequireAuth from '@/components/RequireAuth';

export default function DataCoveragePage() {
  return (
    <RequireAuth roles={['admin']}>
      <div className="page-content">
        <DataCoverageMatrix initialReportType="sales" />
      </div>
    </RequireAuth>
  );
}
