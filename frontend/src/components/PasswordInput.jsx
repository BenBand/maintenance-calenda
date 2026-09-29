import { useState } from 'react';

/**
 * A password field with a show/hide toggle. Wraps the same props an
 * <input type="password"> would accept so it drops in anywhere a password
 * field is used (login, user creation, profile password change, etc.).
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  required = false,
  minLength,
  maxLength,
  autoComplete,
  disabled = false,
  className = 'input',
  label,
  hint,
}) {
  const [visible, setVisible] = useState(false);
  const type = visible ? 'text' : 'password';
  const toggleId = `${id}-toggle`;

  return (
    <div className="form-field">
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="password-input-wrap">
        <input
          className={className}
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          className="password-toggle"
          id={toggleId}
          onClick={() => setVisible((prev) => !prev)}
          aria-pressed={visible}
          aria-label={visible ? `Hide password for ${label || id}` : `Show password for ${label || id}`}
          disabled={disabled}
          title={visible ? 'Hide password' : 'Show password'}
        >
          <span className="password-toggle__icon" aria-hidden="true">
            {visible ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9.5 9.5a3 3 0 0 0 4.24 4.24" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </span>
        </button>
      </div>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}