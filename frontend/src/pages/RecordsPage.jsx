import { useCallback, useState } from 'react';
import { apiFetch, readApiData, downloadPdf } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import { EmptyState, ErrorState, SkeletonPage } from '../components/AsyncState';

export default function RecordsPage() {
  const [search, setSearch] = useState('');
  const [filterAsset, setFilterAsset] = useState('');
  const [exportLoading, setExportLoading] = useState(null);

  const loadPage = useCallback(async () => {
    const [recordsRes, schedulesRes] = await Promise.all([
      apiFetch('/services', {}),
      apiFetch('/maintenance', {}),
    ]);
    return {
      records: await readApiData(recordsRes),
      schedules: await readApiData(schedulesRes),
    };
  }, []);

  const { data, loading, error, reload } = useApiData(loadPage);
  const records = data?.records || [];
  const schedules = data?.schedules || [];
  const filtered = records.filter((record) => {
    if (filterAsset && record.asset_type !== filterAsset) return false;
    if (search && !(record.work_performed?.toLowerCase().includes(search.toLowerCase()) || record.signer_name?.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const getScheduleAssetType = (scheduleId) => schedules.find((schedule) => schedule.id === scheduleId)?.asset_type || null;

  const handleExportRecord = async (recordId) => {
    setExportLoading(recordId);
    try {
      await downloadPdf(`/services/${recordId}/export/pdf`, `service-record-${recordId}.pdf`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export service record. Please try again.');
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportCertificate = async (recordId) => {
    setExportLoading(recordId);
    try {
      await downloadPdf(`/services/${recordId}/export/certificate`, `completion-certificate-${recordId}.pdf`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export completion certificate. Please try again.');
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportCompliance = async () => {
    setExportLoading('compliance');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filterAsset) params.append('asset_type', filterAsset);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      await downloadPdf(`/services/export/compliance${queryString}`, `compliance-report-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export compliance report. Please try again.');
    } finally {
      setExportLoading(null);
    }
  };

  if (loading && !data) return <SkeletonPage label="Loading maintenance records..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="page page--wide" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Maintenance Records</h1>
          <p className="page-subtitle">List and filter all maintenance activities</p>
        </div>
        <div className="page-header-actions">
          <button className="button button--secondary" type="button" onClick={handleExportCompliance} disabled={exportLoading === 'compliance' || loading}>
            {exportLoading === 'compliance' ? 'Generating...' : 'Export Compliance Report'}
          </button>
        </div>
      </header>

      {error && <div className="inline-alert" role="alert"><span>{error}</span><button className="button button--secondary button--small" type="button" onClick={reload}>Retry</button></div>}

      <div className="filters" aria-label="Record filters">
        <div className="filter-group filter-group--search">
          <label className="sr-only" htmlFor="record-search">Search records</label>
          <input className="input" id="record-search" type="search" placeholder="Search records..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="record-asset-type">Asset type</label>
          <select className="input" id="record-asset-type" value={filterAsset} onChange={(event) => setFilterAsset(event.target.value)}>
            <option value="">All Asset Types</option>
            <option value="laptop">Laptop</option>
            <option value="desktop">Desktop</option>
            <option value="network_equipment">Network Equipment</option>
            <option value="printer">Printer</option>
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table data-table--responsive">
          <caption className="sr-only">Maintenance records</caption>
          <thead>
            <tr><th scope="col">Date</th><th scope="col">Asset Type</th><th scope="col">Room</th><th scope="col">Work Performed</th><th scope="col">Outcome</th><th scope="col">Follow-up</th><th scope="col">Signer</th><th scope="col">Signed Date</th><th scope="col">Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((record) => (
              <tr key={record.id}>
                <td data-label="Date">{record.created_at?.split('T')[0] || '-'}</td>
                <td data-label="Asset type">{getScheduleAssetType(record.schedule_id)?.replace(/_/g, ' ') || '-'}</td>
                <td data-label="Room">{record.room || '-'}</td>
                <td data-label="Work performed">{record.work_performed?.substring(0, 50)}{record.work_performed?.length > 50 ? '...' : ''}</td>
                <td data-label="Outcome">{record.outcome || '-'}</td>
                <td data-label="Follow-up">{record.follow_up || '-'}</td>
                <td data-label="Signer">{record.signer_name || '-'}</td>
                <td data-label="Signed date">{record.signer_date || '-'}</td>
                <td data-label="Actions">
                  <div className="table-actions">
                    <button className="button button--secondary button--small" type="button" onClick={() => handleExportRecord(record.id)} disabled={exportLoading === record.id} aria-label="Export service record PDF">
                      {exportLoading === record.id ? '...' : 'Export'}
                    </button>
                    <button className="button button--primary button--small" type="button" onClick={() => handleExportCertificate(record.id)} disabled={exportLoading === record.id} aria-label="Export completion certificate PDF">
                      {exportLoading === record.id ? '...' : 'Certificate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan="9"><EmptyState>No records found</EmptyState></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
