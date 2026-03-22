import type { FieldElement } from '../../types/formSchema';
import FieldWrapper from './FieldWrapper';

interface Props {
  element: FieldElement;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  disabled?: boolean;
}

function formatCpf(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function CpfField({ element, value, onChange, error, disabled }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(formatCpf(e.target.value));
  };

  return (
    <FieldWrapper element={element} error={error}>
      <input
        id={`field-${element.key}`}
        className="form-input"
        type="text"
        inputMode="numeric"
        placeholder={element.placeholder || '000.000.000-00'}
        value={value}
        onChange={handleChange}
        required={element.required}
        disabled={disabled}
        maxLength={14}
        data-testid={`input-${element.key}`}
      />
    </FieldWrapper>
  );
}
