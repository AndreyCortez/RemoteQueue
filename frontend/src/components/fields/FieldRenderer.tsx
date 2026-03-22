import type { FieldElement, SectionElement, FormElement } from '../../types/formSchema';
import StringField from './StringField';
import IntegerField from './IntegerField';
import BooleanField from './BooleanField';
import CpfField from './CpfField';
import DateField from './DateField';
import SelectField from './SelectField';
import PollField from './PollField';
import SectionHeader from './SectionHeader';

interface FieldProps {
  element: FieldElement;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  disabled?: boolean;
}

interface ElementRendererProps {
  element: FormElement;
  value?: string;
  onChange?: (val: string) => void;
  error?: string;
  disabled?: boolean;
}

function FieldSwitch({ element, value, onChange, error, disabled }: FieldProps) {
  const props = { element, value, onChange, error, disabled };
  switch (element.type) {
    case 'integer': return <IntegerField {...props} />;
    case 'boolean': return <BooleanField {...props} />;
    case 'cpf': return <CpfField {...props} />;
    case 'date': return <DateField {...props} />;
    case 'select': return <SelectField {...props} />;
    case 'poll': return <PollField {...props} />;
    default: return <StringField {...props} />;
  }
}

export default function ElementRenderer({ element, value = '', onChange, error, disabled }: ElementRendererProps) {
  if (element.kind === 'section') {
    return <SectionHeader element={element as SectionElement} />;
  }
  return (
    <FieldSwitch
      element={element as FieldElement}
      value={value}
      onChange={onChange ?? (() => {})}
      error={error}
      disabled={disabled}
    />
  );
}
