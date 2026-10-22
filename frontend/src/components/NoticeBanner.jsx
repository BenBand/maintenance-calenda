import { useEffect, useState } from 'react';
import { apiFetch, readApiData } from '../services/api';

export default function NoticeBanner() {
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch('/notices?published=true', {});
        const data = await readApiData(res);
        if (Array.isArray(data)) setNotices(data);
      } catch (err) {
        // Silently fail
      }
    };
    load();
  }, []);

  if (notices.length === 0) return null;

  return (
    <div style={{ marginBottom: '24px' }}>
      {notices.map((notice) => (
        <div
          key={notice.id}
          style={{
            padding: '16px 20px',
            background: notice.notice_type === 'emergency' ? 'var(--danger-bg, #fee)' : 'var(--warning-bg, #fff3cd)',
            border: `2px solid ${notice.notice_type === 'emergency' ? 'var(--danger)' : '#ffc107'}`,
            borderRadius: '8px',
            marginBottom: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>
              {notice.notice_type === 'emergency' ? '🚨' : notice.notice_type === 'planned_outage' ? '🔧' : '📢'}
            </span>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 8px 0', color: notice.notice_type === 'emergency' ? 'var(--danger)' : '#856404' }}>
                {notice.title}
              </h3>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{notice.message}</p>
              <div style={{ fontSize: '13px', marginTop: '8px', opacity: 0.9 }}>
                <strong>Starts:</strong> {new Date(notice.start_time).toLocaleString()}
                {notice.end_time && <> | <strong>Ends:</strong> {new Date(notice.end_time).toLocaleString()}</>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
