import type { FieldElement } from '../../types/formSchema';
import FieldWrapper from './FieldWrapper';

interface Props {
  element: FieldElement;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  disabled?: boolean;
}

export default function PollField({ element, value, onChange, error, disabled }: Props) {
  const options = element.options ?? [];
  return (
    <FieldWrapper element={element} error={error}>
      <div className="radio-group" role="radiogroup" aria-labelledby={`label-${element.key}`}>
        {options.map(opt => (
          <label
            key={opt}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', cursor: disabled ? 'not-allowed' : 'pointer',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid',
              borderColor: value === opt ? 'var(--accent-primary)' : 'var(--border-subtle)',
              background: value === opt ? 'var(--accent-glow)' : 'transparent',
              transition: 'all var(--transition-fast)',
              fontSize: '0.88rem',
            }}
          >
            <input
              type="radio"
              name={`poll-${element.key}`}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              disabled={disabled}
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            {opt}
          </label>
        ))}
      </div>
    </FieldWrapper>
  );
}
