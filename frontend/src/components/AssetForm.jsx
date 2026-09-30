import { useEffect, useId, useState } from 'react';
import { fromDateInput, toDateInput } from '../utils/datetime';

const LIFECYCLE_STATUSES = [
  { value: 'procurement', label: 'In procurement' },
  { value: 'deployed', label: 'Deployed' },
  { value: 'in_service', label: 'In service' },
  { value: 'maintenance', label: 'In maintenance' },
  { value: 'retired', label: 'Retired' },
  { value: 'disposed', label: 'Disposed' },
];

const EVENT_TYPES = [
  'procurement', 'deployment', 'maintenance', 'repair', 'upgrade',
  'relocation', 'retirement', 'disposal', 'status_change', 'note',
];

const EVENT_LABELS = {
  procurement: 'Procured',
  deployment: 'Deployment',
  maintenance: 'Maintenance',
  repair: 'Repair',
  upgrade: 'Upgrade',
  relocation: 'Relocation',
  retirement: 'Retirement',
  disposal: 'Disposal',
  status_change: 'Status change',
  note: 'Note',
};

/**
 * Create/edit form for a registry asset. The API expects writable fields under
 * `user` plus an optional `lifecycle_event` that records the transition in the
 * same transaction, so the payload is assembled here.
 */
export default function AssetForm({ initialData, assetTypes = [], onSubmit, onCancel, submitLabel, loading = false }) {
  const formId = useId();
  const isEdit = Boolean(initialData);

  const [form, setForm] = useState(() => ({
    asset_identifier: initialData?.asset_identifier || '',
    asset_type: initialData?.asset_type || assetTypes[0]?.code || 'laptop',
    make_model: initialData?.make_model || '',
    serial_number: initialData?.serial_number || '',
    description: initialData?.description || '',
    department: initialData?.department || '',
    room: initialData?.room || '',
    assigned_to: initialData?.assigned_to || '',
    supplier: initialData?.supplier || '',
    purchase_date: toDateInput(initialData?.purchase_date),
    warranty_start: toDateInput(initialData?.warranty_start),
    warranty_expiry: toDateInput(initialData?.warranty_expiry),
    deployed_date: toDateInput(initialData?.deployed_date),
    end_of_life_date: toDateInput(initialData?.end_of_life_date),
    lifecycle_status: initialData?.lifecycle_status || 'procurement',
    condition_rating: initialData?.condition_rating || 'good',
    disposal_date: toDateInput(initialData?.disposal_date),
    disposal_method: initialData?.disposal_method || '',
    disposal_reference: initialData?.disposal_reference || '',
    notes: initialData?.notes || '',
  }));

  // Log an event alongside the asset change, e.g. the procurement record when
  // registering new equipment.
  const [event, setEvent] = useState({
    enabled: !isEdit,
    event_type: 'procurement',
    event_date: toDateInput(initialData?.purchase_date) || toDateInput(new Date()),
    description: '',
    performed_by: '',
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!form.asset_type && assetTypes[0]?.code) {
      setForm((current) => ({ ...current, asset_type: assetTypes[0].code }));
    }
  }, [assetTypes, form.asset_type]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleEventChange = (field, value) => {
    setEvent((current) => ({ ...current, [field]: value }));
  };

  const validate = () => {
    const next = {};
    if (!form.asset_identifier.trim()) next.asset_identifier = 'Asset identifier is required';
    if (!form.asset_type) next.asset_type = 'Asset type is required';
    if (form.parts_replaced && form.parts_replaced.length > 2000) next.parts_replaced = 'Must be 2000 characters or fewer';
    if (form.warranty_start && form.warranty_expiry && form.warranty_expiry < form.warranty_start) {
      next.warranty_expiry = 'Warranty expiry must be after the start date';
    }
    if (form.lifecycle_status === 'disposed' && !form.disposal_date && !initialData?.disposal_date) {
      next.disposal_date = 'A disposal date is required to mark an asset disposed';
    }
    if (form.end_of_life_date && form.purchase_date && form.end_of_life_date < form.purchase_date) {
      next.end_of_life_date = 'End of life cannot precede the purchase date';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (submitEvent) => {
    submitEvent.preventDefault();
    if (!validate()) return;

    const user = {};
    Object.entries(form).forEach(([key, value]) => {
      user[key] = value === '' ? null : value;
    });
    // Dates are sent as plain YYYY-MM-DD so the API can store them as DATE
    // without a timezone shift.
    ['purchase_date', 'warranty_start', 'warranty_expiry', 'deployed_date', 'end_of_life_date', 'disposal_date']
      .forEach((key) => {
        user[key] = fromDateInput(form[key]);
      });

    const payload = { user };
    if (event.enabled) {
      payload.lifecycle_event = {
        event_type: event.event_type,
        event_date: fromDateInput(event.event_date) || user.purchase_date,
        description: event.description || null,
        performed_by: event.performed_by || null,
      };
    }

    onSubmit(payload);
  };

  const fieldClass = (field) => `input${errors[field] ? ' input--error' : ''}`;
  const errorId = (field) => `${formId}-${field}-error`;
  const describedBy = (field) => (errors[field] ? errorId(field) : undefined);

  const Field = ({ name, label, type = 'text', ...rest }) => (
    <div className="form-field">
      <label className="field-label" htmlFor={`${formId}-${name}`}>{label}</label>
      <input
        className={fieldClass(name)}
        id={`${formId}-${name}`}
        type={type}
        value={form[name]}
        onChange={(e) => handleChange(name, e.target.value)}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={describedBy(name)}
        {...rest}
      />
      {errors[name] && <span className="error-text" id={errorId(name)}>{errors[name]}</span>}
    </div>
  );

  return (
    <form className="form-stack" onSubmit={handleSubmit} aria-busy={loading}>
      <fieldset className="form-section">
        <legend className="form-section__legend">Identity</legend>
        <div className="form-row">
          <Field name="asset_identifier" label="Asset identifier *" placeholder="e.g. LT-014" maxLength={255} />
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-asset_type`}>Asset type *</label>
            <select
              className={fieldClass('asset_type')}
              id={`${formId}-asset_type`}
              value={form.asset_type}
              onChange={(e) => handleChange('asset_type', e.target.value)}
              aria-invalid={Boolean(errors.asset_type)}
            >
              {assetTypes.length === 0 && <option value={form.asset_type}>{form.asset_type}</option>}
              {assetTypes.map((type) => <option key={type.code} value={type.code}>{type.label}</option>)}
            </select>
            {errors.asset_type && <span className="error-text">{errors.asset_type}</span>}
          </div>
        </div>
        <div className="form-row">
          <Field name="make_model" label="Make and model" placeholder="e.g. Dell Latitude 5440" maxLength={255} />
          <Field name="serial_number" label="Serial number" maxLength={255} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-description`}>Description</label>
          <textarea
            className="input"
            id={`${formId}-description`}
            rows={2}
            maxLength={2000}
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section__legend">Ownership and location</legend>
        <div className="form-row">
          <Field name="department" label="Department" maxLength={255} />
          <Field name="room" label="Room / location" maxLength={255} />
        </div>
        <div className="form-row">
          <Field name="assigned_to" label="Assigned to" maxLength={255} />
          <Field name="supplier" label="Supplier" maxLength={255} />
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section__legend">Procurement</legend>
        <div className="form-row">
          <Field name="purchase_date" label="Purchase date" type="date" />
          <Field name="condition_rating" label="Condition" type="text" list="condition-ratings" />
          <datalist id="condition-ratings">
            <option value="excellent">Excellent</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="poor">Poor</option>
            <option value="critical">Critical</option>
          </datalist>
        </div>
        <div className="form-row">
          <Field name="warranty_start" label="Warranty start" type="date" />
          <Field name="warranty_expiry" label="Warranty expiry" type="date" />
        </div>
        <div className="form-row">
          <Field name="deployed_date" label="Deployment date" type="date" />
          <Field name="end_of_life_date" label="End-of-life date" type="date" />
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section__legend">Lifecycle</legend>
        <div className="form-row">
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-lifecycle_status`}>Lifecycle stage</label>
            <select
              className={fieldClass('lifecycle_status')}
              id={`${formId}-lifecycle_status`}
              value={form.lifecycle_status}
              onChange={(e) => handleChange('lifecycle_status', e.target.value)}
            >
              {LIFECYCLE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>
          {form.lifecycle_status === 'disposed' && (
            <>
              <Field name="disposal_date" label="Disposal date *" type="date" />
              <Field name="disposal_method" label="Disposal method" placeholder="e.g. Recycled" maxLength={100} />
              <Field name="disposal_reference" label="Disposal reference" placeholder="e.g. LCC/REC/2026/07" maxLength={255} />
            </>
          )}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-notes`}>Notes</label>
          <textarea
            className="input"
            id={`${formId}-notes`}
            rows={2}
            maxLength={5000}
            value={form.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend className="form-section__legend">Lifecycle event</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={event.enabled}
            onChange={(e) => handleEventChange('enabled', e.target.checked)}
          />
          <span>Record a lifecycle event with this change</span>
        </label>

        {event.enabled && (
          <>
            <div className="form-row">
              <div className="form-field">
                <label className="field-label" htmlFor={`${formId}-event-type`}>Event type</label>
                <select
                  className="input"
                  id={`${formId}-event-type`}
                  value={event.event_type}
                  onChange={(e) => handleEventChange('event_type', e.target.value)}
                >
                  {EVENT_TYPES.map((type) => <option key={type} value={type}>{EVENT_LABELS[type]}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor={`${formId}-event-date`}>Event date</label>
                <input
                  className="input"
                  id={`${formId}-event-date`}
                  type="date"
                  value={event.event_date}
                  onChange={(e) => handleEventChange('event_date', e.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor={`${formId}-event-performed-by`}>Performed by</label>
                <input
                  className="input"
                  id={`${formId}-event-performed-by`}
                  type="text"
                  maxLength={255}
                  value={event.performed_by}
                  onChange={(e) => handleEventChange('performed_by', e.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="field-label" htmlFor={`${formId}-event-description`}>Event description</label>
                <input
                  className="input"
                  id={`${formId}-event-description`}
                  type="text"
                  maxLength={2000}
                  value={event.description}
                  onChange={(e) => handleEventChange('description', e.target.value)}
                />
              </div>
            </div>
          </>
        )}
      </fieldset>

      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={loading}>
          {loading ? 'Saving...' : (submitLabel || 'Save asset')}
        </button>
        <button className="button button--secondary" type="button" onClick={onCancel} disabled={loading}>Cancel</button>
      </div>
    </form>
  );
}
