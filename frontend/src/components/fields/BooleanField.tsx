import type { FieldElement } from '../../types/formSchema';
import FieldWrapper from './FieldWrapper';

interface Props {
  element: FieldElement;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  disabled?: boolean;
}

export default function BooleanField({ element, value, onChange, error, disabled }: Props) {
  const isOn = value === 'true';
  return (
    <FieldWrapper element={element} error={error}>
      <button
        type="button"
        className="toggle-switch"
        role="switch"
        aria-checked={isOn}
        onClick={() => !disabled && onChange(isOn ? 'false' : 'true')}
        disabled={disabled}
        data-testid={`input-${element.key}`}
        style={{
          position: 'relative',
          width: 52, height: 28,
          borderRadius: 14,
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: isOn ? 'var(--accent-primary)' : 'var(--border-subtle)',
          transition: 'background var(--transition-fast)',
          padding: 0,
        }}
      >
        <span style={{
          position: 'absolute',
          top: 3, left: isOn ? 27 : 3,
          width: 22, height: 22,
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left var(--transition-fast)',
        }} />
      </button>
      <span style={{ marginLeft: 10, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {isOn ? 'Sim' : 'Nao'}
      </span>
    </FieldWrapper>
  );
}
