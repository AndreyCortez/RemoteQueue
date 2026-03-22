import type { SectionElement } from '../../types/formSchema';

interface Props {
  element: SectionElement;
}

export default function SectionHeader({ element }: Props) {
  return (
    <div className="form-section" style={{
      borderTop: '1px solid var(--border-subtle)',
      paddingTop: 20,
      marginTop: 20,
      marginBottom: 16,
    }}>
      {element.title && (
        <h3 style={{
          fontSize: '1rem', fontWeight: 600,
          color: 'var(--text-primary)', marginBottom: 4,
        }}>
          {element.title}
        </h3>
      )}
      {element.description && (
        <p style={{
          fontSize: '0.85rem', color: 'var(--text-secondary)',
          margin: 0, lineHeight: 1.5,
        }}>
          {element.description}
        </p>
      )}
      {element.image_url && (
        <img
          src={element.image_url}
          alt={element.title || ''}
          style={{
            marginTop: 12, maxWidth: '100%', maxHeight: 200,
            borderRadius: 'var(--radius-sm)', objectFit: 'cover',
          }}
        />
      )}
    </div>
  );
}
