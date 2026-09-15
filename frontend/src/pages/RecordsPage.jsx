import React, { useEffect, useState } from 'react';
import { useAuth } from '../services/auth';
import MaintenanceForm from '../components/MaintenanceForm';
import ServiceMaintenanceForm from '../components/ServiceMaintenanceForm';
import { apiFetch } from '../services/auth';

export default function RecordsPage() {
  const { token, user } = useAuth();
  const [records, setRecords] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [search, setSearch] = useState('');
  const [filterAsset, setFilterAsset] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);

  useEffect(() => { loadRecords(); loadSchedules(); }, []);

  const loadRecords = async () => {
    try {
      const res = await apiFetch('/services', {}, token);
      if (res.ok) setRecords(await res.json());
    } catch (err) { console.error('Failed to load records', err); }
  };

  const loadSchedules = async () => {
    try {
      const res = await apiFetch('/maintenance', {}, token);
      if (res.ok) setSchedules(await res.json());
    } catch (err) { console.error('Failed to load schedules', err); }
  };

  const data = Array.isArray(records) ? records : (records?.data || []);
  const schedulesData = Array.isArray(schedules) ? schedules : (schedules?.data || []);

  const filtered = data.filter((r) => {
    if (filterAsset && r.asset_type !== filterAsset) return false;
    if (filterStatus && r.outcome && r.outcome.toLowerCase().includes(filterStatus.toLowerCase())) return false;
    if (search && !(r.work_performed?.toLowerCase().includes(search.toLowerCase()) || r.signer_name?.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const getScheduleAssetType = (scheduleId) => {
    const s = schedulesData.find((x) => x.id === scheduleId);
    return s ? s.asset_type : null;
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>Maintenance Records</h1>
          <p style={styles.subtitle}>List and filter all maintenance activities</p>
        </div>
      </div>
      <div style={styles.filters}>
        <input type="text" placeholder="Search records..." value={search} onChange={(e) => setSearch(e.target.value)} style={styles.searchInput} />
        <select value={filterAsset} onChange={(e) => setFilterAsset(e.target.value)} style={styles.filterSelect}>
          <option value="">All Asset Types</option>
          <option value="laptop">Laptop</option>
          <option value="desktop">Desktop</option>
          <option value="network_equipment">Network Equipment</option>
          <option value="printer">Printer</option>
        </select>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Asset Type</th>
              <th style={styles.th}>Room</th>
              <th style={styles.th}>Work Performed</th>
              <th style={styles.th}>Outcome</th>
              <th style={styles.th}>Follow-up</th>
              <th style={styles.th}>Signer</th>
              <th style={styles.th}>Signed Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={styles.td}>{r.created_at?.split('T')[0] || '-'}</td>
                <td style={styles.td}>{getScheduleAssetType(r.schedule_id)?.replace(/_/g, ' ') || '-'}</td>
                <td style={styles.td}>{r.room || '-'}</td>
                <td style={styles.td}>{r.work_performed?.substring(0, 50)}{r.work_performed?.length > 50 ? '...' : ''}</td>
                <td style={styles.td}>{r.outcome || '-'}</td>
                <td style={styles.td}>{r.follow_up || '-'}</td>
                <td style={styles.td}>{r.signer_name || '-'}</td>
                <td style={styles.td}>{r.signer_date || '-'}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#6b7280', padding: '24px' }}>No records found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  header: { marginBottom: '24px' },
  heading: { margin: 0, fontSize: '28px', color: '#1f2937', fontWeight: '700' },
  subtitle: { margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' },
  filters: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' },
  searchInput: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', minWidth: '240px' },
  filterSelect: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff' },
  tableWrap: { borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' },
  th: { textAlign: 'left', padding: '10px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: '600', color: '#374151' },
  td: { padding: '10px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', color: '#374151' },
};
