import { useEffect, useId, useMemo, useState } from 'react';

const ASSET_TYPES = ['laptop', 'desktop', 'network_equipment', 'printer'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

/** Words that hint at the kind of incident, used to seed the suggestion lists. */
const INCIDENT_HINTS = [
  { match: /(not working|not turning on|not powering|not starting|dead|broken)/i, issue: 'not working' },
  { match: /(slow|lag|freeze|hang)/i, issue: 'running slow' },
  { match: /(error|crash|fail)/i, issue: 'showing an error' },
  { match: /(no|check).*(internet|connection|network)|offline/i, issue: 'losing connectivity' },
  { match: /(jam|toner|ink|paper)/i, issue: 'jamming paper' },
  { match: /(display|screen|monitor|blank|black screen)/i, issue: 'having display issues' },
  { match: /(keyboard|mouse|trackpad|input)/i, issue: 'having input problems' },
  { match: /(sound|audio|speaker|noise)/i, issue: 'having audio problems' },
  { match: /(login|password|sign in|account)/i, issue: 'having sign-in trouble' },
  { match: /(print)/i, issue: 'failing to print' },
];

function humanize(value) {
  if (!value) return '';
  return String(value).replace(/_/g, ' ');
}

function titleCase(value) {
  const text = humanize(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toLower(value) {
  return humanize(value).toLowerCase();
}

function dedupe(list) {
  return [...new Set(list.filter(Boolean))];
}

/**
 * Build a handful of title suggestions from the incident's context so the
 * reporter can accept one instead of typing from scratch. Each suggestion is
 * different enough that a user who dislikes the first can try the next, and
 * every one is editable afterwards.
 */
export function suggestTitles({ assetType, priority, department, room, assetIdentifier, description }) {
  const asset = assetType ? titleCase(assetType) : 'Device';
  const where = room || department;
  const location = where ? ` in ${where}` : '';
  const hint = (description ? INCIDENT_HINTS.find((entry) => entry.match.test(description)) : null)?.issue;
  const issue = hint || (priority === 'critical' ? 'urgent fault' : priority === 'high' ? 'fault' : 'issue');

  const titles = [
    `${asset} ${issue}${location}`,
    `${asset} needs attention${location}`,
    `${asset} reported not working${assetIdentifier ? ` (${assetIdentifier})` : ''}`,
  ];
  if (department) titles.push(`${titleCase(department)} ${toLower(asset)} ${issue}`);
  if (room) titles.push(`Room ${room}: ${asset} ${issue}`);
  return dedupe(titles);
}

/** Sentence templates for the description, phrased for the IT team to action. */
export function suggestDescriptions({ assetType, room, department, assetIdentifier, priority }) {
  const asset = assetType ? titleCase(assetType) : 'device';
  const location = room || department || 'the office';
  const id = assetIdentifier ? ` (asset ID: ${assetIdentifier})` : '';
  const urgency = priority === 'critical'
    ? 'This is blocking work and needs immediate attention.'
    : priority === 'high'
      ? 'Please treat this as urgent.'
      : 'Please attend to this when possible.';

  return dedupe([
    `The ${toLower(asset)}${id} at ${location} is not working as expected. ${urgency} Please investigate and repair.`,
    `I am unable to use the ${toLower(asset)}${id} in ${location}. The problem started today and is still happening. ${urgency}`,
    `Report of a ${toLower(asset)} fault${id} at ${location}. ${urgency} Please confirm the cause and advise on the fix.`,
  ]);
}

/**
 * Report / edit form for an incident.
 *
 * The department and asset type lists carry an explicit "Other" choice that
 * reveals a free-text field, so a user can name something the list does not
 * cover without leaving the form. The chosen text is written straight into the
 * form state, so the payload the parent submits carries a plain value.
 *
 * Titles and descriptions are suggested from the incident's context and can be
 * accepted with one tap, ignored entirely, or edited after being applied.
 */
export default function ReportIncidentForm({
  editingId, form, setForm, errors = {}, loading, actionError,
  departments = [], onSubmit, onClose, canWriteIncidents,
}) {
  const formId = useId();
  // Which fields are showing their "Other" text box. Editing an incident whose
  // value is not one of the standard options starts with that field open.
  const [otherFields, setOtherFields] = useState({
    department: false,
    asset_type: false,
  });

  const departmentOptions = useMemo(
    () => (departments || []).filter((name) => typeof name === 'string' && name.trim()),
    [departments],
  );

  useEffect(() => {
    setOtherFields({
      department: Boolean(form.department) && !departmentOptions.includes(form.department),
      asset_type: Boolean(form.asset_type) && !ASSET_TYPES.includes(form.asset_type),
    });
    // Only re-run when an edit loads, not on every keystroke of the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleOtherChange = (field, value) => {
    setOtherFields((current) => ({ ...current, [field]: true }));
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSelectChange = (field, value) => {
    if (value === '') {
      setOtherFields((current) => ({ ...current, [field]: false }));
      setForm((current) => ({ ...current, [field]: '' }));
      return;
    }
    const known = field === 'asset_type' ? ASSET_TYPES : departmentOptions;
    if (known.includes(value)) {
      setOtherFields((current) => ({ ...current, [field]: false }));
      setForm((current) => ({ ...current, [field]: value }));
    } else {
      // An unknown value means "Other": keep the text and open the box.
      setOtherFields((current) => ({ ...current, [field]: true }));
      setForm((current) => ({ ...current, [field]: value }));
    }
  };

  const titleSuggestions = useMemo(
    () => suggestTitles(form),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.asset_type, form.priority, form.department, form.room, form.asset_identifier, form.description],
  );
  const descriptionSuggestions = useMemo(
    () => suggestDescriptions(form),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.asset_type, form.room, form.department, form.asset_identifier, form.priority],
  );

  const applyTitle = (title) => setForm((current) => ({ ...current, title }));
  const applyDescription = (description) => setForm((current) => ({ ...current, description }));

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(event);
  };

  const errorId = (field) => `${formId}-${field}-error`;
  const describedBy = (field, hasError) => (hasError ? errorId(field) : undefined);

  // Status is the IT team's call, not the reporter's. Letting a reporter set it
  // would let them mark their own issue resolved and then rate the fix that
  // never happened, so it only renders for a role that works the queue.
  const showStatus = Boolean(canWriteIncidents);

  return (
    <form className="form-stack" onSubmit={handleSubmit} aria-busy={loading} noValidate>
      {actionError && <div className="inline-alert" role="alert"><span>{actionError}</span></div>}

      <div className="form-field">
        <label className="field-label" htmlFor={`${formId}-title`}>Title *</label>
        <input
          className={`input${errors.title ? ' input--error' : ''}`}
          id={`${formId}-title`}
          type="text"
          value={form.title}
          onChange={(event) => handleChange('title', event.target.value.slice(0, 255))}
          placeholder="A short summary of the problem"
          maxLength={255}
          required
          aria-invalid={Boolean(errors.title)}
          aria-describedby={describedBy('title', errors.title)}
        />
        {errors.title && <span className="error-text" id={errorId('title')}>{errors.title}</span>}
        {titleSuggestions.length > 0 && (
          <div className="suggestion-row" aria-label="Suggested titles">
            <span className="suggestion-row__label">Suggestions</span>
            {titleSuggestions.map((title) => (
              <button
                key={title}
                className="suggestion-chip"
                type="button"
                onClick={() => applyTitle(title)}
                aria-label={`Use title: ${title}`}
              >
                {title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="form-field">
        <label className="field-label" htmlFor={`${formId}-description`}>Description *</label>
        <textarea
          className={`input${errors.description ? ' input--error' : ''}`}
          id={`${formId}-description`}
          value={form.description}
          onChange={(event) => handleChange('description', event.target.value.slice(0, 2000))}
          placeholder="Describe what is wrong and where"
          rows={3}
          maxLength={2000}
          required
          aria-invalid={Boolean(errors.description)}
          aria-describedby={describedBy('description', errors.description)}
        />
        {errors.description && <span className="error-text" id={errorId('description')}>{errors.description}</span>}
        {descriptionSuggestions.length > 0 && (
          <div className="suggestion-row" aria-label="Suggested descriptions">
            <span className="suggestion-row__label">Suggestions</span>
            {descriptionSuggestions.map((description, index) => (
              <button
                key={`${index}-${description.slice(0, 24)}`}
                className="suggestion-chip"
                type="button"
                onClick={() => applyDescription(description)}
                aria-label={`Use suggestion ${index + 1}`}
              >
                Suggestion {index + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-department`}>Department</label>
          {otherFields.department ? (
            <>
              <input
                className={`input${errors.department ? ' input--error' : ''}`}
                id={`${formId}-department`}
                type="text"
                value={form.department}
                onChange={(event) => handleOtherChange('department', event.target.value.slice(0, 255))}
                placeholder="Type the department"
                maxLength={255}
                aria-invalid={Boolean(errors.department)}
                aria-describedby={describedBy('department', errors.department)}
              />
              <span className="field-hint">Not in the list? Type it in.</span>
            </>
          ) : (
            <select
              className={`input${errors.department ? ' input--error' : ''}`}
              id={`${formId}-department`}
              value={form.department}
              onChange={(event) => handleSelectChange('department', event.target.value)}
              aria-invalid={Boolean(errors.department)}
              aria-describedby={describedBy('department', errors.department)}
            >
              <option value="">Select department</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
              <option value="__other__">Other (specify)</option>
            </select>
          )}
          {errors.department && <span className="error-text" id={errorId('department')}>{errors.department}</span>}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-room`}>Room</label>
          <input
            className={`input${errors.room ? ' input--error' : ''}`}
            id={`${formId}-room`}
            type="text"
            value={form.room}
            onChange={(event) => handleChange('room', event.target.value.slice(0, 255))}
            placeholder="Where the asset is"
            maxLength={255}
            aria-invalid={Boolean(errors.room)}
            aria-describedby={describedBy('room', errors.room)}
          />
          {errors.room && <span className="error-text" id={errorId('room')}>{errors.room}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-asset-type`}>Asset Type</label>
          {otherFields.asset_type ? (
            <>
              <input
                className={`input${errors.asset_type ? ' input--error' : ''}`}
                id={`${formId}-asset-type`}
                type="text"
                value={form.asset_type}
                onChange={(event) => handleOtherChange('asset_type', event.target.value.slice(0, 255))}
                placeholder="Type the asset type"
                maxLength={255}
                aria-invalid={Boolean(errors.asset_type)}
                aria-describedby={describedBy('asset_type', errors.asset_type)}
              />
              <span className="field-hint">Not in the list? Type it in.</span>
            </>
          ) : (
            <select
              className={`input${errors.asset_type ? ' input--error' : ''}`}
              id={`${formId}-asset-type`}
              value={form.asset_type}
              onChange={(event) => handleSelectChange('asset_type', event.target.value)}
              aria-invalid={Boolean(errors.asset_type)}
              aria-describedby={describedBy('asset_type', errors.asset_type)}
            >
              <option value="">None</option>
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>{titleCase(type)}</option>
              ))}
              <option value="__other__">Other (specify)</option>
            </select>
          )}
          {errors.asset_type && <span className="error-text" id={errorId('asset_type')}>{errors.asset_type}</span>}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-asset-identifier`}>Asset Identifier</label>
          <input
            className={`input${errors.asset_identifier ? ' input--error' : ''}`}
            id={`${formId}-asset-identifier`}
            type="text"
            value={form.asset_identifier}
            onChange={(event) => handleChange('asset_identifier', event.target.value.slice(0, 255))}
            placeholder="Serial/tag"
            maxLength={255}
            aria-invalid={Boolean(errors.asset_identifier)}
            aria-describedby={describedBy('asset_identifier', errors.asset_identifier)}
          />
          {errors.asset_identifier && <span className="error-text" id={errorId('asset_identifier')}>{errors.asset_identifier}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-priority`}>Priority</label>
          <select
            className="input"
            id={`${formId}-priority`}
            value={form.priority}
            onChange={(event) => handleChange('priority', event.target.value)}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{titleCase(priority)}</option>
            ))}
          </select>
        </div>
        {showStatus && (
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-status`}>Status</label>
            <select
              className="input"
              id={`${formId}-status`}
              value={form.status}
              onChange={(event) => handleChange('status', event.target.value)}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>{titleCase(status)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={loading}>
          {loading ? 'Saving...' : (editingId ? 'Update Incident' : 'Report Incident')}
        </button>
        <button className="button button--secondary" type="button" onClick={onClose} disabled={loading}>Cancel</button>
      </div>
    </form>
  );
}
