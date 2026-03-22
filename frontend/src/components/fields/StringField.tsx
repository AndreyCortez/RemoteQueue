import type { FieldElement } from '../../types/formSchema';
import FieldWrapper from './FieldWrapper';

interface Props {
  element: FieldElement;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  disabled?: boolean;
}

export default function StringField({ element, value, onChange, error, disabled }: Props) {
  return (
    <FieldWrapper element={element} error={error}>
      <input
        id={`field-${element.key}`}
        className="form-input"
        type="text"
        placeholder={element.placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={element.required}
        disabled={disabled}
        data-testid={`input-${element.key}`}
      />
    </FieldWrapper>
  );
}
