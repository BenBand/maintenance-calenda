import { useCallback, useState } from 'react';
import { useAuth } from '../services/auth';
import { PERMISSIONS } from '../services/permissions';
import { apiFetch, readApiData, readApiArray } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import Modal from '../components/Modal';
import AssetForm from '../components/AssetForm';
import LifecycleTimeline, { LifecycleProgress } from '../components/LifecycleTimeline';
import { EmptyState, ErrorState, SkeletonPage } from '../components/AsyncState';
import { formatCurrency, formatMinutes, humanizeKey } from '../utils/datetime';
import './assets.css';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'deployed', label: 'Deployed' },
  { value: 'in_service', label: 'In Service' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
  { value: 'disposed', label: 'Disposed' },
];

const WARRANTY_FILTERS = [
  { value: '', label: 'Any warranty' },
  { value: 'expiring', label: 'Expiring within 90 days' },
  { value: 'expired', label: 'Expired' },
];

function statusBadgeClass(status) {
  const map = {
    procurement: 'badge--neutral',
    deployed: 'badge--info',
    in_service: 'badge--status-completed',
    maintenance: 'badge--status-in_progress',
    retired: 'badge--status-overdue',
    disposed: 'badge--neutral',
  };
  return map[status] || 'badge--neutral';
}

function AssetDetail({ assetId, assetTypes, canWrite, onChanged, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  const loadAsset = useCallback(async () => {
    const res = await apiFetch(`/assets/${assetId}`, {});
    return readApiData(res);
  }, [assetId]);

  const { data: asset, loading, error: loadError, reload } = useApiData(loadAsset);

  const advanceLifecycle = async (lifecycle_status, extra = {}) => {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/assets/${assetId}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({ lifecycle_status, ...extra }),
      });
      await reload();
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err.message || 'Unable to change lifecycle stage');
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (payload) => {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/assets/${assetId}`, { method: 'PUT', body: JSON.stringify(payload) });
      setShowEdit(false);
      await reload();
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err.message || 'Unable to save asset');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !asset) return <SkeletonPage label="Loading asset..." />;
  if (loadError && !asset) return <ErrorState message={loadError} onRetry={reload} />;
  if (!asset) return null;

  return (
    <div className="asset-detail">
      {error && <div className="inline-alert" role="alert"><span>{error}</span></div>}

      <header className="asset-detail__header">
        <div>
          <h2 className="asset-detail__title">{asset.asset_identifier}</h2>
          <p className="asset-detail__meta">
            {asset.asset_type_label || humanizeKey(asset.asset_type)}
            {asset.make_model ? ` · ${asset.make_model}` : ''}
            {asset.serial_number ? ` · SN ${asset.serial_number}` : ''}
          </p>
        </div>
        <button className="button button--secondary button--small" type="button" onClick={onClose} aria-label="Close asset details">&times;</button>
      </header>

      <dl className="asset-detail__facts">
        <div><dt>Stage</dt><dd><span className={`badge ${statusBadgeClass(asset.lifecycle_status)}`}>{humanizeKey(asset.lifecycle_status)}</span></dd></div>
        <div><dt>Department</dt><dd>{asset.department || '—'}</dd></div>
        <div><dt>Location</dt><dd>{asset.room || '—'}</dd></div>
        <div><dt>Assigned to</dt><dd>{asset.assigned_to || '—'}</dd></div>
        <div><dt>Services</dt><dd>{asset.service_records?.length ?? 0}</dd></div>
        <div><dt>Incidents</dt><dd>{asset.incidents?.length ?? 0}</dd></div>
        <div><dt>Lifetime cost</dt><dd>{asset.lifetime_service_cost > 0 ? formatCurrency(asset.lifetime_service_cost) : '—'}</dd></div>
        {asset.lifetime_downtime_minutes > 0 && (
          <div><dt>Lifetime downtime</dt><dd>{formatMinutes(asset.lifetime_downtime_minutes)}</dd></div>
        )}
      </dl>

      {asset.warranty_expiring_soon && (
        <div className="inline-alert inline-alert--warning" role="status">
          <span>Warranty expires on {String(asset.warranty_expiry).slice(0, 10)}</span>
        </div>
      )}
      {asset.warranty_expired && (
        <div className="inline-alert inline-alert--warning" role="status">
          <span>Warranty expired on {String(asset.warranty_expiry).slice(0, 10)}</span>
        </div>
      )}
      {asset.end_of_life_soon && (
        <div className="inline-alert inline-alert--warning" role="status">
          <span>End of life on {String(asset.end_of_life_date).slice(0, 10)}</span>
        </div>
      )}

      {canWrite && (
        <div className="asset-detail__actions">
          <button className="button button--secondary button--small" type="button" onClick={() => setShowEdit(true)} disabled={busy}>
            Edit details
          </button>
          {asset.lifecycle_status === 'procurement' && (
            <button className="button button--primary button--small" type="button" onClick={() => advanceLifecycle('deployed')} disabled={busy}>
              Mark deployed
            </button>
          )}
          {['deployed', 'in_service'].includes(asset.lifecycle_status) && (
            <>
              <button className="button button--secondary button--small" type="button" onClick={() => advanceLifecycle('maintenance')} disabled={busy}>
                Send to maintenance
              </button>
              <button className="button button--secondary button--small" type="button" onClick={() => advanceLifecycle('retired')} disabled={busy}>
                Retire
              </button>
            </>
          )}
          {asset.lifecycle_status === 'maintenance' && (
            <button className="button button--primary button--small" type="button" onClick={() => advanceLifecycle('in_service')} disabled={busy}>
              Return to service
            </button>
          )}
          {asset.lifecycle_status === 'retired' && (
            <button
              className="button button--danger button--small"
              type="button"
              onClick={() => {
                const disposal_date = window.prompt('Disposal date (YYYY-MM-DD)');
                if (!disposal_date) return;
                const disposal_method = window.prompt('Disposal method (e.g. Recycled, Sold, Scrapped)') || '';
                advanceLifecycle('disposed', { disposal_date, disposal_method });
              }}
              disabled={busy}
            >
              Dispose
            </button>
          )}
        </div>
      )}

      <LifecycleTimeline events={asset.events || []} asset={asset} />

      {Array.isArray(asset.schedules) && asset.schedules.length > 0 && (
        <section className="asset-detail__section">
          <h3 className="subsection__title">Maintenance schedule</h3>
          <ul className="mini-list">
            {asset.schedules.map((schedule) => (
              <li key={schedule.id} className="mini-list__item">
                <span>{String(schedule.scheduled_at).slice(0, 10)}</span>
                <span>{schedule.description || humanizeKey(schedule.asset_type)}</span>
                <span className={`badge badge--status-${schedule.status}`}>{humanizeKey(schedule.status)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {Array.isArray(asset.service_records) && asset.service_records.length > 0 && (
        <section className="asset-detail__section">
          <h3 className="subsection__title">Service history</h3>
          <ul className="mini-list">
            {asset.service_records.map((record) => (
              <li key={record.id} className="mini-list__item">
                <span>{String(record.signer_date || record.created_at || '').slice(0, 10)}</span>
                <span>{record.work_performed?.slice(0, 60) || '—'}</span>
                <span>{record.total_cost > 0 ? formatCurrency(record.total_cost) : '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showEdit && (
        <Modal title={`Edit ${asset.asset_identifier}`} onClose={() => setShowEdit(false)}>
          <AssetForm
            initialData={asset}
            assetTypes={assetTypes}
            onSubmit={handleEdit}
            onCancel={() => setShowEdit(false)}
            submitLabel="Save changes"
            loading={busy}
          />
        </Modal>
      )}
    </div>
  );
}

export default function AssetsPage() {
  const { can } = useAuth();
  const canWrite = can(PERMISSIONS.ASSET_WRITE);
  const canDelete = can(PERMISSIONS.ASSET_DELETE);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [warrantyFilter, setWarrantyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const loadAssets = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('lifecycle_status', statusFilter);
    if (typeFilter) params.set('asset_type', typeFilter);
    if (departmentFilter) params.set('department', departmentFilter);
    if (warrantyFilter) params.set('warranty_state', warrantyFilter);
    params.set('page', String(page));
    params.set('limit', '50');
    const query = params.toString();

    const [assetsRes, typesRes, statsRes, departmentsRes] = await Promise.all([
      apiFetch(`/assets?${query}`, {}),
      apiFetch('/assets/types', {}),
      apiFetch('/assets/stats', {}),
      apiFetch('/maintenance/departments', {}),
    ]);

    return {
      assets: await readApiArray(assetsRes, 'data'),
      pagination: await readApiData(assetsRes).then((d) => d?.pagination || {}),
      assetTypes: await readApiArray(typesRes),
      stats: await readApiData(statsRes),
      departments: await readApiArray(departmentsRes),
    };
  }, [search, statusFilter, typeFilter, departmentFilter, warrantyFilter, page]);

  const { data, loading, error, reload } = useApiData(loadAssets);
  const assets = data?.assets || [];
  const assetTypes = data?.assetTypes || [];
  const stats = data?.stats?.totals || null;
  const departments = data?.departments || [];
  const pagination = data?.pagination || {};

  const handleCreate = async (payload) => {
    setFormError('');
    setFormLoading(true);
    try {
      await apiFetch('/assets', { method: 'POST', body: JSON.stringify(payload) });
      setShowCreate(false);
      await reload();
    } catch (err) {
      setFormError(err.message || 'Unable to register asset');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (asset) => {
    if (!window.confirm(`Delete ${asset.asset_identifier}? Its lifecycle history will be removed too.`)) return;
    try {
      await apiFetch(`/assets/${asset.id}`, { method: 'DELETE' });
      if (selectedAssetId === asset.id) setSelectedAssetId(null);
      await reload();
    } catch (err) {
      setFormError(err.message || 'Unable to delete asset');
    }
  };

  const applyFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="page" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Asset Registry</h1>
          <p className="page-subtitle">Procurement through deployment, maintenance and disposal</p>
        </div>
        {canWrite && (
          <button className="button button--primary" type="button" onClick={() => setShowCreate(true)}>+ Register Asset</button>
        )}
      </header>

      {(error || formError) && (
        <div className="inline-alert" role="alert">
          <span>{error || formError}</span>
          {error && <button className="button button--secondary button--small" type="button" onClick={reload}>Retry</button>}
        </div>
      )}

      {stats && (
        <div className="stats-grid stats-grid--secondary" aria-label="Fleet summary">
          <div className="stat-card stat-card--compact">
            <div className="stat-card__number">{stats.total}</div>
            <div className="stat-card__label">Total Assets</div>
            <div className="stat-card__hint">{formatCurrency(stats.procurement_spend)} procured</div>
          </div>
          <div className="stat-card stat-card--compact stat-card--success">
            <div className="stat-card__number">{stats.in_service + stats.deployed}</div>
            <div className="stat-card__label">In Service</div>
            <div className="stat-card__hint">avg age {stats.avg_age_years}y</div>
          </div>
          <div className="stat-card stat-card--compact stat-card--info">
            <div className="stat-card__number">{stats.maintenance}</div>
            <div className="stat-card__label">In Maintenance</div>
            <div className="stat-card__hint">{stats.procurement} in procurement</div>
          </div>
          <div className="stat-card stat-card--compact stat-card--danger">
            <div className="stat-card__number">{stats.warranty_expiring}</div>
            <div className="stat-card__label">Warranty Expiring</div>
            <div className="stat-card__hint">{stats.warranty_expired} already expired</div>
          </div>
          <div className="stat-card stat-card--compact">
            <div className="stat-card__number">{stats.end_of_life_soon}</div>
            <div className="stat-card__label">End of Life</div>
            <div className="stat-card__hint">within 180 days</div>
          </div>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Filter by lifecycle stage">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || 'all'}
            className={`tab${statusFilter === tab.value ? ' tab--active' : ''}`}
            type="button"
            role="tab"
            aria-selected={statusFilter === tab.value}
            onClick={() => applyFilter(setStatusFilter)(tab.value)}
          >
            {tab.label}
            {tab.value && stats ? ` (${stats[tab.value] ?? 0})` : ''}
          </button>
        ))}
      </div>

      <div className="filters" aria-label="Asset filters">
        <div className="filter-group filter-group--search">
          <label className="sr-only" htmlFor="asset-search">Search assets</label>
          <input
            className="input"
            id="asset-search"
            type="search"
            placeholder="Search identifier, serial, model..."
            value={search}
            onChange={(e) => applyFilter(setSearch)(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="asset-type">Asset type</label>
          <select className="input" id="asset-type" value={typeFilter} onChange={(e) => applyFilter(setTypeFilter)(e.target.value)}>
            <option value="">All Types</option>
            {assetTypes.map((type) => <option key={type.code} value={type.code}>{type.label}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="asset-department">Department</label>
          <select className="input" id="asset-department" value={departmentFilter} onChange={(e) => applyFilter(setDepartmentFilter)(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="asset-warranty">Warranty</label>
          <select className="input" id="asset-warranty" value={warrantyFilter} onChange={(e) => applyFilter(setWarrantyFilter)(e.target.value)}>
            {WARRANTY_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <div className="assets-layout">
        <section className="assets-list" aria-label="Assets">
          {assets.length === 0 && !loading ? (
            <EmptyState>No assets match these filters</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table--compact data-table--responsive">
                <caption className="sr-only">Asset registry</caption>
                <thead>
                  <tr>
                    <th scope="col">Identifier</th>
                    <th scope="col">Type</th>
                    <th scope="col">Department</th>
                    <th scope="col">Stage</th>
                    <th scope="col">Warranty</th>
                    <th scope="col">End of Life</th>
                    {canDelete && <th scope="col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => (
                    <tr key={asset.id} className={selectedAssetId === asset.id ? 'is-selected' : undefined}>
                      <td data-label="Identifier">
                        <button className="link-button" type="button" onClick={() => setSelectedAssetId(asset.id)}>
                          {asset.asset_identifier}
                        </button>
                        {asset.make_model && <span className="cell-subtitle">{asset.make_model}</span>}
                      </td>
                      <td data-label="Type">{humanizeKey(asset.asset_type)}</td>
                      <td data-label="Department">{asset.department || '—'}</td>
                      <td data-label="Stage">
                        <span className={`badge ${statusBadgeClass(asset.lifecycle_status)}`}>
                          {humanizeKey(asset.lifecycle_status)}
                        </span>
                      </td>
                      <td data-label="Warranty">
                        {asset.warranty_expiry ? (
                          <span className={asset.warranty_expired ? 'value--negative' : asset.warranty_expiring_soon ? 'value--warning' : undefined}>
                            {String(asset.warranty_expiry).slice(0, 10)}
                            {asset.warranty_expired ? ' (expired)' : asset.warranty_expiring_soon ? ' (soon)' : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td data-label="End of Life">{asset.end_of_life_date ? String(asset.end_of_life_date).slice(0, 10) : '—'}</td>
                      {canDelete && (
                        <td data-label="Actions">
                          <button
                            className="button button--danger button--small"
                            type="button"
                            onClick={() => handleDelete(asset)}
                            aria-label={`Delete ${asset.asset_identifier}`}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination.pages > 1 && (
            <nav className="pagination" aria-label="Asset pages">
              <button className="button button--secondary button--small" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Previous
              </button>
              <span className="pagination__status">Page {pagination.page} of {pagination.pages} ({pagination.total} assets)</span>
              <button className="button button--secondary button--small" type="button" onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages}>
                Next
              </button>
            </nav>
          )}
        </section>

        {selectedAssetId && (
          <aside className="assets-detail-panel" aria-label="Asset detail">
            <AssetDetail
              key={selectedAssetId}
              assetId={selectedAssetId}
              assetTypes={assetTypes}
              canWrite={canWrite}
              onChanged={reload}
              onClose={() => setSelectedAssetId(null)}
            />
          </aside>
        )}
      </div>

      {showCreate && canWrite && (
        <Modal title="Register Asset" onClose={() => setShowCreate(false)}>
          <AssetForm
            assetTypes={assetTypes}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            submitLabel="Register asset"
            loading={formLoading}
          />
        </Modal>
      )}
    </div>
  );
}
