import type { FieldElement } from '../../types/formSchema';
import FieldWrapper from './FieldWrapper';

interface Props {
  element: FieldElement;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  disabled?: boolean;
}

export default function SelectField({ element, value, onChange, error, disabled }: Props) {
  const options = element.options ?? [];
  return (
    <FieldWrapper element={element} error={error}>
      <select
        id={`field-${element.key}`}
        className="form-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        required={element.required}
        disabled={disabled}
        data-testid={`input-${element.key}`}
      >
        <option value="">Selecione...</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </FieldWrapper>
  );
}
