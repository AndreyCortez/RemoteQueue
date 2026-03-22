import type { FormElement, FieldElement, SectionElement, FieldType } from '../../types/formSchema';
import { FIELD_TYPES, FIELD_TYPE_LABELS } from '../../types/formSchema';

interface Props {
  element: FormElement;
  onChange: (updated: FormElement) => void;
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40);
}

function SectionConfig({ element, onChange }: { element: SectionElement; onChange: (e: SectionElement) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        className="form-input"
        type="text"
        placeholder="Titulo da secao"
        value={element.title}
        onChange={e => onChange({ ...element, title: e.target.value })}
        maxLength={100}
      />
      <textarea
        className="form-input"
        placeholder="Descricao (opcional)"
        value={element.description}
        onChange={e => onChange({ ...element, description: e.target.value })}
        rows={2}
        style={{ resize: 'vertical', minHeight: 50 }}
        maxLength={500}
      />
      <input
        className="form-input"
        type="url"
        placeholder="URL da imagem (opcional)"
        value={element.image_url || ''}
        onChange={e => onChange({ ...element, image_url: e.target.value || null })}
      />
    </div>
  );
}

function FieldConfigForm({ element, onChange }: { element: FieldElement; onChange: (e: FieldElement) => void }) {
  const needsOptions = element.type === 'select' || element.type === 'poll';
  const options = element.options ?? [''];

  const updateOption = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    onChange({ ...element, options: updated });
  };

  const addOption = () => {
    onChange({ ...element, options: [...options, ''] });
  };

  const removeOption = (index: number) => {
    if (options.length <= 1) return;
    onChange({ ...element, options: options.filter((_, i) => i !== index) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Row 1: label + type */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label className="form-label">Nome do campo</label>
          <input
            className="form-input"
            type="text"
            placeholder="ex: Nome completo"
            value={element.label}
            onChange={e => {
              const label = e.target.value;
              const autoKey = !element.key || element.key === slugify(element.label);
              onChange({
                ...element,
                label,
                key: autoKey ? slugify(label) : element.key,
              });
            }}
            maxLength={80}
          />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className="form-label">Tipo</label>
          <select
            className="form-select"
            value={element.type}
            onChange={e => {
              const type = e.target.value as FieldType;
              const newOpts = (type === 'select' || type === 'poll') ? (element.options ?? ['']) : null;
              onChange({ ...element, type, options: newOpts });
            }}
          >
            {FIELD_TYPES.map(t => (
              <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: placeholder + key + required */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 140 }}>
          <label className="form-label">Placeholder</label>
          <input
            className="form-input"
            type="text"
            placeholder="Texto de ajuda"
            value={element.placeholder}
            onChange={e => onChange({ ...element, placeholder: e.target.value })}
            maxLength={100}
          />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <label className="form-label">Identificador</label>
          <input
            className="form-input"
            type="text"
            placeholder="campo_id"
            value={element.key}
            onChange={e => onChange({ ...element, key: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() })}
            maxLength={40}
            style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingBottom: 10, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={element.required}
            onChange={e => onChange({ ...element, required: e.target.checked })}
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          Obrigatorio
        </label>
      </div>

      {/* Options list for select/poll */}
      {needsOptions && (
        <div>
          <label className="form-label">Opcoes</label>
          {options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input
                className="form-input"
                type="text"
                placeholder={`Opcao ${i + 1}`}
                value={opt}
                onChange={e => updateOption(i, e.target.value)}
                maxLength={100}
              />
              {options.length > 1 && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeOption(i)} style={{ padding: '4px 8px', minHeight: 'auto' }}>✕</button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={addOption} style={{ marginTop: 4 }}>
            + Opcao
          </button>
        </div>
      )}
    </div>
  );
}

export default function FieldConfig({ element, onChange }: Props) {
  if (element.kind === 'section') {
    return <SectionConfig element={element} onChange={onChange as (e: SectionElement) => void} />;
  }
  return <FieldConfigForm element={element as FieldElement} onChange={onChange as (e: FieldElement) => void} />;
}
