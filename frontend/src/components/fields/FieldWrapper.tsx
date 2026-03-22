import type { FieldElement } from '../../types/formSchema';
import type { ReactNode } from 'react';

interface Props {
  element: FieldElement;
  error?: string;
  children: ReactNode;
}

export default function FieldWrapper({ element, error, children }: Props) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={`field-${element.key}`} id={`label-${element.key}`}>
        {element.label || element.key}
        {!element.required && (
          <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.8em' }}>(opcional)</span>
        )}
      </label>
      {children}
      {error && (
        <p style={{ color: 'var(--accent-error)', fontSize: '0.78rem', marginTop: 4 }}>{error}</p>
      )}
    </div>
  );
}
