import { useEffect, useId, useMemo, useState } from 'react';

const ASSET_TYPES = ['laptop', 'desktop', 'network_equipment', 'printer'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const DEFAULT_DEPARTMENTS = [
  'Human Resource and Administration',
  'Legal Services',
  'Finance',
  'Engineering Services',
  'Housing and Social Services',
  'City Planning',
  'Public Health',
  'Internal Audit',
  'Public Relations',
  'Procurement and Supplies',
  'Information and Communication Technology',
];

const WIZARD_STEPS = [
  { key: 'issue', label: 'Issue', description: 'What is the problem?' },
  { key: 'location', label: 'Location', description: 'Where did it happen?' },
  { key: 'asset', label: 'Asset & Priority', description: 'Device and urgency' },
  { key: 'review', label: 'Review', description: 'Confirm and submit' },
];

const STEP_FIELDS = {
  issue: ['title', 'description'],
  location: ['department', 'room'],
  asset: ['asset_identifier', 'asset_type', 'priority'],
};

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

function textValue(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

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

function validateStep(stepKey, form) {
  const nextErrors = {};
  const title = textValue(form.title).trim();
  const description = textValue(form.description).trim();
  const department = textValue(form.department);
  const room = textValue(form.room);
  const assetIdentifier = textValue(form.asset_identifier);
  const assetType = textValue(form.asset_type);
  const priority = textValue(form.priority);

  if (stepKey === 'issue') {
    if (!title) nextErrors.title = 'Title is required';
    else if (title.length > 255) nextErrors.title = 'Title must be 255 characters or fewer';
    if (!description) nextErrors.description = 'Description is required';
    else if (description.length > 2000) nextErrors.description = 'Description must be 2000 characters or fewer';
  }

  if (stepKey === 'location') {
    if (department.trim().length > 255) nextErrors.department = 'Department must be 255 characters or fewer';
    if (room.trim().length > 255) nextErrors.room = 'Room must be 255 characters or fewer';
  }

  if (stepKey === 'asset') {
    if (assetIdentifier.trim().length > 255) nextErrors.asset_identifier = 'Asset identifier must be 255 characters or fewer';
    if (assetType.trim().length > 100) nextErrors.asset_type = 'Asset type must be 100 characters or fewer';
    if (priority && !PRIORITIES.includes(priority)) nextErrors.priority = 'Invalid priority';
  }

  return nextErrors;
}

function validateAll(form) {
  return {
    ...validateStep('issue', form),
    ...validateStep('location', form),
    ...validateStep('asset', form),
  };
}

function ReviewItem({ label, value }) {
  return (
    <div className="report-review__item">
      <dt className="report-review__label">{label}</dt>
      <dd className="report-review__value">{value || <span className="text-muted">Not provided</span>}</dd>
    </div>
  );
}

export default function ReportIncidentForm({
  editingId, form, setForm, errors = {}, loading, actionError,
  departments = [], onSubmit, onClose, canWriteIncidents, wizard = false,
}) {
  const formId = useId();
  const [otherFields, setOtherFields] = useState({ department: false, asset_type: false });
  const [stepIndex, setStepIndex] = useState(0);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverErrors, setServerErrors] = useState({});

  const allErrors = useMemo(() => ({ ...fieldErrors, ...serverErrors }), [fieldErrors, serverErrors]);

  const departmentOptions = useMemo(() => {
    const provided = (departments || []).filter((name) => typeof name === 'string' && name.trim());
    return provided.length > 0 ? provided : DEFAULT_DEPARTMENTS;
  }, [departments]);

  useEffect(() => {
    setOtherFields({
      department: Boolean(form.department) && !departmentOptions.includes(form.department),
      asset_type: Boolean(form.asset_type) && !ASSET_TYPES.includes(form.asset_type),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    setServerErrors(errors && typeof errors === 'object' ? errors : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors]);

  const clearFieldError = (field) => {
    setFieldErrors((current) => {
      if (!current?.[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setServerErrors((current) => {
      if (!current?.[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  };

  const handleOtherChange = (field, value) => {
    setOtherFields((current) => ({ ...current, [field]: true }));
    setForm((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  };

  const handleSelectChange = (field, value) => {
    if (value === '' || value === '__other__') {
      const isOther = value === '__other__';
      setOtherFields((current) => ({ ...current, [field]: isOther }));
      setForm((current) => ({ ...current, [field]: '' }));
      clearFieldError(field);
      return;
    }
    const known = field === 'asset_type' ? ASSET_TYPES : departmentOptions;
    if (known.includes(value)) {
      setOtherFields((current) => ({ ...current, [field]: false }));
      setForm((current) => ({ ...current, [field]: value }));
    } else {
      setOtherFields((current) => ({ ...current, [field]: true }));
      setForm((current) => ({ ...current, [field]: value }));
    }
    clearFieldError(field);
  };

  const titleSuggestions = useMemo(() => suggestTitles(form),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.asset_type, form.priority, form.department, form.room, form.asset_identifier, form.description]);
  const descriptionSuggestions = useMemo(() => suggestDescriptions(form),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.asset_type, form.room, form.department, form.asset_identifier, form.priority]);

  const applyTitle = (title) => handleChange('title', title);
  const applyDescription = (description) => handleChange('description', description);

  const errorId = (field) => `${formId}-${field}-error`;
  const describedBy = (field, hasError) => (hasError ? errorId(field) : undefined);
  const showStatus = Boolean(canWriteIncidents);
  const currentStep = WIZARD_STEPS[stepIndex];

  const goNext = () => {
    const stepFields = STEP_FIELDS[currentStep.key] || [];
    const errs = validateStep(currentStep.key, form);
    setFieldErrors((current) => {
      const next = { ...current };
      stepFields.forEach((field) => delete next[field]);
      Object.entries(errs).forEach(([key, value]) => {
        next[key] = value;
      });
      return next;
    });
    if (Object.keys(errs).length > 0) return;
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (wizard) {
      if (stepIndex < WIZARD_STEPS.length - 1) {
        goNext();
        return;
      }
      const errs = validateAll(form);
      setFieldErrors(errs);
      if (Object.keys(errs).length > 0) {
        return;
      }
      setFieldErrors({});
    }

    if (typeof onSubmit === 'function') onSubmit(event);
  };

  const renderIssueStep = () => (
    <>
      <div className="form-field">
        <label className="field-label" htmlFor={`${formId}-title`}>Title *</label>
        <input
          className={`input${allErrors.title ? ' input--error' : ''}`}
          id={`${formId}-title`}
          type="text"
          value={form.title}
          onChange={(event) => handleChange('title', event.target.value.slice(0, 255))}
          placeholder="A short summary of the problem"
          maxLength={255}
          required
          aria-invalid={Boolean(allErrors.title)}
          aria-describedby={describedBy('title', allErrors.title)}
        />
        {allErrors.title && <span className="error-text" id={errorId('title')}>{allErrors.title}</span>}
        {titleSuggestions.length > 0 && (
          <div className="suggestion-row" aria-label="Suggested titles">
            <span className="suggestion-row__label">Suggestions</span>
            {titleSuggestions.map((title) => (
              <button key={title} className="suggestion-chip" type="button" onClick={() => applyTitle(title)} aria-label={`Use title: ${title}`}>
                {title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="form-field">
        <label className="field-label" htmlFor={`${formId}-description`}>Description *</label>
        <textarea
          className={`input${allErrors.description ? ' input--error' : ''}`}
          id={`${formId}-description`}
          value={form.description}
          onChange={(event) => handleChange('description', event.target.value.slice(0, 2000))}
          placeholder="Describe what is wrong and where"
          rows={wizard ? 6 : 3}
          maxLength={2000}
          required
          aria-invalid={Boolean(allErrors.description)}
          aria-describedby={describedBy('description', allErrors.description)}
        />
        {allErrors.description && <span className="error-text" id={errorId('description')}>{allErrors.description}</span>}
        {descriptionSuggestions.length > 0 && (
          <div className="suggestion-row" aria-label="Suggested descriptions">
            <span className="suggestion-row__label">Suggestions</span>
            {descriptionSuggestions.map((description, index) => (
              <button key={`${index}-${description.slice(0, 24)}`} className="suggestion-chip" type="button" onClick={() => applyDescription(description)} aria-label={`Use suggestion ${index + 1}`}>
                Suggestion {index + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const renderLocationStep = () => (
    <div className="form-row">
      <div className="form-field">
        <label className="field-label" htmlFor={`${formId}-department`}>Department/Unit</label>
        {otherFields.department ? (
          <>
            <input
              className={`input${allErrors.department ? ' input--error' : ''}`}
              id={`${formId}-department`}
              type="text"
              value={form.department}
              onChange={(event) => handleOtherChange('department', event.target.value.slice(0, 255))}
              placeholder="Type the department/unit"
              maxLength={255}
              aria-invalid={Boolean(allErrors.department)}
              aria-describedby={describedBy('department', allErrors.department)}
            />
            <button className="button button--secondary button--small" type="button" onClick={() => { setOtherFields((c) => ({ ...c, department: false })); handleChange('department', ''); }}>
              Choose from list
            </button>
          </>
        ) : (
          <select
            className={`input${allErrors.department ? ' input--error' : ''}`}
            id={`${formId}-department`}
            value={departmentOptions.includes(form.department) ? form.department : ''}
            onChange={(event) => handleSelectChange('department', event.target.value)}
            aria-invalid={Boolean(allErrors.department)}
            aria-describedby={describedBy('department', allErrors.department)}
          >
            <option value="">Select department/unit</option>
            {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
            <option value="__other__">Other (specify)</option>
          </select>
        )}
        {allErrors.department && <span className="error-text" id={errorId('department')}>{allErrors.department}</span>}
      </div>
      <div className="form-field">
        <label className="field-label" htmlFor={`${formId}-room`}>Room</label>
        <input
          className={`input${allErrors.room ? ' input--error' : ''}`}
          id={`${formId}-room`}
          type="text"
          value={form.room}
          onChange={(event) => handleChange('room', event.target.value.slice(0, 255))}
          placeholder="Where the asset is"
          maxLength={255}
          aria-invalid={Boolean(allErrors.room)}
          aria-describedby={describedBy('room', allErrors.room)}
        />
        {allErrors.room && <span className="error-text" id={errorId('room')}>{allErrors.room}</span>}
      </div>
    </div>
  );

  const renderAssetStep = () => (
    <>
      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-asset-type`}>Asset Type</label>
          {otherFields.asset_type ? (
            <>
              <input
                className={`input${allErrors.asset_type ? ' input--error' : ''}`}
                id={`${formId}-asset-type`}
                type="text"
                value={form.asset_type}
                onChange={(event) => handleOtherChange('asset_type', event.target.value.slice(0, 100))}
                placeholder="Type the asset type"
                maxLength={100}
                aria-invalid={Boolean(allErrors.asset_type)}
                aria-describedby={describedBy('asset_type', allErrors.asset_type)}
              />
              <span className="field-hint">Not in the list? Type it in.</span>
            </>
          ) : (
            <select
              className={`input${allErrors.asset_type ? ' input--error' : ''}`}
              id={`${formId}-asset-type`}
              value={form.asset_type}
              onChange={(event) => handleSelectChange('asset_type', event.target.value)}
              aria-invalid={Boolean(allErrors.asset_type)}
              aria-describedby={describedBy('asset_type', allErrors.asset_type)}
            >
              <option value="">None</option>
              {ASSET_TYPES.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
              <option value="__other__">Other (specify)</option>
            </select>
          )}
          {allErrors.asset_type && <span className="error-text" id={errorId('asset_type')}>{allErrors.asset_type}</span>}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-asset-identifier`}>Asset Identifier</label>
          <input
            className={`input${allErrors.asset_identifier ? ' input--error' : ''}`}
            id={`${formId}-asset-identifier`}
            type="text"
            value={form.asset_identifier}
            onChange={(event) => handleChange('asset_identifier', event.target.value.slice(0, 255))}
            placeholder="Serial/tag"
            maxLength={255}
            aria-invalid={Boolean(allErrors.asset_identifier)}
            aria-describedby={describedBy('asset_identifier', allErrors.asset_identifier)}
          />
          {allErrors.asset_identifier && <span className="error-text" id={errorId('asset_identifier')}>{allErrors.asset_identifier}</span>}
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor={`${formId}-priority`}>Priority</label>
          <select className="input" id={`${formId}-priority`} value={form.priority} onChange={(event) => handleChange('priority', event.target.value)}>
            {PRIORITIES.map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}
          </select>
        </div>
        {showStatus && (
          <div className="form-field">
            <label className="field-label" htmlFor={`${formId}-status`}>Status</label>
            <select className="input" id={`${formId}-status`} value={form.status} onChange={(event) => handleChange('status', event.target.value)}>
              {STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
            </select>
          </div>
        )}
      </div>
    </>
  );

  const renderReviewStep = () => {
    const reviewErrors = Object.values(allErrors || {}).filter(Boolean);
    return (
      <div className="report-review">
        <p className="field-hint">Check your details before submitting.</p>
        {reviewErrors.length > 0 && (
          <div className="inline-alert" role="alert">
            <div>
              <strong>Please fix the highlighted fields and try again.</strong>
              <ul className="report-review__errors">
                {reviewErrors.map((message, index) => (
                  <li key={`${index}-${message}`}>{message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <dl className="report-review__list">
          <ReviewItem label="Title" value={form.title} />
          <ReviewItem label="Description" value={form.description} />
          <ReviewItem label="Department/Unit" value={form.department} />
          <ReviewItem label="Room" value={form.room} />
          <ReviewItem label="Asset type" value={form.asset_type ? titleCase(form.asset_type) : ''} />
          <ReviewItem label="Asset identifier" value={form.asset_identifier} />
          <ReviewItem label="Priority" value={form.priority ? titleCase(form.priority) : ''} />
          {showStatus && <ReviewItem label="Status" value={form.status ? titleCase(form.status) : ''} />}
        </dl>
      </div>
    );
  };

  const renderStepContent = () => {
    if (!wizard) {
      return (
        <>
          {renderIssueStep()}
          {renderLocationStep()}
          {renderAssetStep()}
        </>
      );
    }
    if (currentStep.key === 'issue') return renderIssueStep();
    if (currentStep.key === 'location') return renderLocationStep();
    if (currentStep.key === 'asset') return renderAssetStep();
    return renderReviewStep();
  };

  const formBody = (
    <div className="form-stack">
      {actionError && <div className="inline-alert" role="alert"><span>{actionError}</span></div>}
      {wizard && (
        <div className="report-wizard__step-header">
          <h2 className="report-wizard__step-title">{currentStep.label}</h2>
          <p className="field-hint">{currentStep.description}</p>
        </div>
      )}
      {renderStepContent()}

      <div className="form-actions">
        {wizard ? (
          <>
            {stepIndex > 0 && (
              <button className="button button--secondary" type="button" onClick={goBack} disabled={loading}>Back</button>
            )}
            {stepIndex < WIZARD_STEPS.length - 1 ? (
              <button className="button button--primary" type="button" onClick={goNext} disabled={loading}>Next</button>
            ) : (
              <button className="button button--primary" type="submit" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Report'}
              </button>
            )}
            <button className="button button--secondary" type="button" onClick={onClose} disabled={loading}>Cancel</button>
          </>
        ) : (
          <>
            <button className="button button--primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : (editingId ? 'Update Incident' : 'Report Incident')}
            </button>
            <button className="button button--secondary" type="button" onClick={onClose} disabled={loading}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );

  if (!wizard) {
    return (
      <form className="form-stack" onSubmit={handleSubmit} aria-busy={loading} noValidate>
        {formBody.props.children}
      </form>
    );
  }

  return (
    <form className="report-wizard" onSubmit={handleSubmit} aria-busy={loading} noValidate>
      <aside className="report-wizard__progress" aria-label="Reporting progress">
        <p className="report-wizard__stamp">Progress</p>
        <ol className="report-wizard__steps">
          {WIZARD_STEPS.map((step, index) => {
            const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo';
            return (
              <li key={step.key} className={`report-wizard__step report-wizard__step--${state}`}>
                <span className="report-wizard__step-index" aria-hidden="true">{index < stepIndex ? '✓' : index + 1}</span>
                <span className="report-wizard__step-text">
                  <span className="report-wizard__step-label">{step.label}</span>
                  <span className="report-wizard__step-desc">{step.description}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </aside>
      <section className="report-wizard__content">
        {formBody.props.children}
      </section>
    </form>
  );
}
