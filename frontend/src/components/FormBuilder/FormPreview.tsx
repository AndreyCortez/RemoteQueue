import { useState } from 'react';
import type { FormSchemaV2, TenantBranding } from '../../types/formSchema';
import { createEmptyFormData } from '../../types/formSchema';
import ElementRenderer from '../fields/FieldRenderer';

interface Props {
  schema: FormSchemaV2;
  branding?: TenantBranding | null;
}

export default function FormPreview({ schema, branding }: Props) {
  const [formData, setFormData] = useState<Record<string, string>>(() => createEmptyFormData(schema));

  // Reset form data when schema changes
  const fieldKeys = schema.elements
    .filter(e => e.kind === 'field')
    .map(e => e.kind === 'field' ? e.key : '')
    .join(',');

  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 24,
      background: branding?.background_color || 'var(--bg-card)',
      maxWidth: 440,
      ...(branding?.primary_color ? { borderTop: `3px solid ${branding.primary_color}` } : {}),
    }}>
      {/* Branding header */}
      {branding && (branding.logo_url || branding.company_name) && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          {branding.logo_url && (
            <img
              src={branding.logo_url}
              alt={branding.company_name || ''}
              style={{ maxHeight: 40, maxWidth: 160, objectFit: 'contain', marginBottom: 6 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          {branding.company_name && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{branding.company_name}</p>
          )}
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 16 }}>
        Preview do formulario
      </p>

      {schema.elements.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: 20 }}>
          Adicione campos para ver o preview
        </p>
      ) : (
        <form onSubmit={e => e.preventDefault()} key={fieldKeys}>
          {schema.elements.map(element => (
            <ElementRenderer
              key={element.id}
              element={element}
              value={element.kind === 'field' ? (formData[element.key] ?? '') : undefined}
              onChange={element.kind === 'field'
                ? (val: string) => setFormData(prev => ({ ...prev, [element.key]: val }))
                : undefined
              }
            />
          ))}
          <button
            type="button"
            className="btn btn-primary btn-full"
            disabled
            style={{
              marginTop: 8, opacity: 0.7,
              ...(branding?.primary_color ? { background: branding.primary_color } : {}),
            }}
          >
            Entrar na Fila
          </button>
        </form>
      )}
    </div>
  );
}
