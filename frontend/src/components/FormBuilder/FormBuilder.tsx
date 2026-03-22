import { useState } from 'react';
import type { FormSchemaV2, FormElement, FieldType } from '../../types/formSchema';
import { FIELD_TYPES, FIELD_TYPE_LABELS, createFieldElement, createSectionElement } from '../../types/formSchema';
import FieldConfig from './FieldConfig';

interface Props {
  schema: FormSchemaV2;
  onChange: (schema: FormSchemaV2) => void;
}

export default function FormBuilder({ schema, onChange }: Props) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const updateElement = (index: number, updated: FormElement) => {
    const elements = [...schema.elements];
    elements[index] = updated;
    onChange({ ...schema, elements });
  };

  const removeElement = (index: number) => {
    onChange({ ...schema, elements: schema.elements.filter((_, i) => i !== index) });
  };

  const moveElement = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= schema.elements.length) return;
    const elements = [...schema.elements];
    [elements[index], elements[target]] = [elements[target], elements[index]];
    onChange({ ...schema, elements });
  };

  const addField = (type: FieldType) => {
    onChange({ ...schema, elements: [...schema.elements, createFieldElement(type)] });
    setAddMenuOpen(false);
  };

  const addSection = () => {
    onChange({ ...schema, elements: [...schema.elements, createSectionElement()] });
    setAddMenuOpen(false);
  };

  return (
    <div className="form-builder">
      {schema.elements.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '32px 16px',
          color: 'var(--text-muted)', fontSize: '0.88rem',
          border: '2px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)',
          marginBottom: 16,
        }}>
          Nenhum campo adicionado. Use os botoes abaixo para comecar.
        </div>
      )}

      {schema.elements.map((element, index) => (
        <div
          key={element.id}
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
            marginBottom: 10,
            background: 'var(--bg-card)',
            animation: 'slide-up 200ms ease',
          }}
        >
          {/* Element header bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {/* Type badge */}
            <span style={{
              fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: 'var(--text-muted)',
              background: 'var(--bg-secondary)', padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
            }}>
              {element.kind === 'section' ? 'Secao' : FIELD_TYPE_LABELS[element.type as FieldType] || element.type}
            </span>

            {/* Title preview */}
            <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {element.kind === 'section' ? (element.title || 'Secao sem titulo') : (element.label || element.key || 'Campo sem nome')}
            </span>

            {/* Reorder */}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveElement(index, -1)} disabled={index === 0} style={{ padding: '4px 8px', minHeight: 'auto', opacity: index === 0 ? 0.3 : 1 }} title="Mover para cima">▲</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveElement(index, 1)} disabled={index === schema.elements.length - 1} style={{ padding: '4px 8px', minHeight: 'auto', opacity: index === schema.elements.length - 1 ? 0.3 : 1 }} title="Mover para baixo">▼</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeElement(index)} style={{ padding: '4px 8px', minHeight: 'auto' }} title="Remover">✕</button>
          </div>

          {/* Inline config */}
          <FieldConfig
            element={element}
            onChange={(updated) => updateElement(index, updated)}
          />
        </div>
      ))}

      {/* Add buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            id="add-field-btn"
          >
            + Adicionar Campo
          </button>
          {addMenuOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-raised)',
              padding: 4, zIndex: 10, minWidth: 160,
            }}>
              {FIELD_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addField(type)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', border: 'none', background: 'none',
                    cursor: 'pointer', fontSize: '0.85rem', borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {FIELD_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={addSection}
        >
          + Adicionar Secao
        </button>
      </div>
    </div>
  );
}
