import type { TenantBranding } from '../types/formSchema';

interface Props {
  branding: TenantBranding;
  onChange: (branding: TenantBranding) => void;
}

export default function BrandingConfig({ branding, onChange }: Props) {
  const update = (key: keyof TenantBranding, value: string) => {
    onChange({ ...branding, [key]: value });
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Nome da empresa</label>
        <input
          className="form-input"
          type="text"
          placeholder="ex: Clinica Sao Lucas"
          value={branding.company_name || ''}
          onChange={e => update('company_name', e.target.value)}
          maxLength={100}
          style={{ maxWidth: 360 }}
        />
      </div>

      <div className="form-group">
        <label className="form-label">URL do logo</label>
        <input
          className="form-input"
          type="url"
          placeholder="https://exemplo.com/logo.png"
          value={branding.logo_url || ''}
          onChange={e => update('logo_url', e.target.value)}
          style={{ maxWidth: 400 }}
        />
        {branding.logo_url && (
          <div style={{ marginTop: 8 }}>
            <img
              src={branding.logo_url}
              alt="Preview do logo"
              style={{ maxHeight: 48, maxWidth: 180, objectFit: 'contain', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', padding: 4 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
          <label className="form-label">Cor principal</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={branding.primary_color || '#0369a1'}
              onChange={e => update('primary_color', e.target.value)}
              style={{ width: 36, height: 36, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 2 }}
            />
            <input
              className="form-input"
              type="text"
              value={branding.primary_color || ''}
              onChange={e => update('primary_color', e.target.value)}
              placeholder="#0369a1"
              maxLength={7}
              style={{ fontFamily: 'monospace', fontSize: '0.82rem', width: 100 }}
            />
          </div>
        </div>

        <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
          <label className="form-label">Cor de fundo</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={branding.background_color || '#f8fafc'}
              onChange={e => update('background_color', e.target.value)}
              style={{ width: 36, height: 36, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 2 }}
            />
            <input
              className="form-input"
              type="text"
              value={branding.background_color || ''}
              onChange={e => update('background_color', e.target.value)}
              placeholder="#f8fafc"
              maxLength={7}
              style={{ fontFamily: 'monospace', fontSize: '0.82rem', width: 100 }}
            />
          </div>
        </div>

        <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
          <label className="form-label">Cor de destaque</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={branding.accent_color || '#059669'}
              onChange={e => update('accent_color', e.target.value)}
              style={{ width: 36, height: 36, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: 2 }}
            />
            <input
              className="form-input"
              type="text"
              value={branding.accent_color || ''}
              onChange={e => update('accent_color', e.target.value)}
              placeholder="#059669"
              maxLength={7}
              style={{ fontFamily: 'monospace', fontSize: '0.82rem', width: 100 }}
            />
          </div>
        </div>
      </div>

      {/* Color preview strip */}
      <div style={{
        display: 'flex', gap: 0, borderRadius: 'var(--radius-sm)', overflow: 'hidden',
        height: 32, marginTop: 8, border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ flex: 1, background: branding.primary_color || '#0369a1' }} title="Principal" />
        <div style={{ flex: 2, background: branding.background_color || '#f8fafc' }} title="Fundo" />
        <div style={{ flex: 1, background: branding.accent_color || '#059669' }} title="Destaque" />
      </div>
    </div>
  );
}
