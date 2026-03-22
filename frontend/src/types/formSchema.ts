// ── Form Schema V2 types ────────────────────────────────────────────────────

export const FIELD_TYPES = ['string', 'integer', 'boolean', 'cpf', 'date', 'select', 'poll'] as const;
export type FieldType = typeof FIELD_TYPES[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  string: 'Texto',
  integer: 'Numero',
  boolean: 'Sim/Nao',
  cpf: 'CPF',
  date: 'Data',
  select: 'Lista',
  poll: 'Enquete',
};

export interface SectionElement {
  kind: 'section';
  id: string;
  title: string;
  description: string;
  image_url?: string | null;
}

export interface FieldElement {
  kind: 'field';
  id: string;
  key: string;
  type: FieldType;
  label: string;
  placeholder: string;
  required: boolean;
  pattern?: string | null;
  options?: string[] | null;
  mask?: string | null;
}

export type FormElement = SectionElement | FieldElement;

export interface FormSchemaV2 {
  version: 2;
  elements: FormElement[];
}

export interface TenantBranding {
  company_name?: string;
  logo_url?: string;
  primary_color?: string;
  background_color?: string;
  accent_color?: string;
}

// ── Legacy types (for backwards compatibility) ──────────────────────────────

interface RichFieldDef {
  type: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
  options?: string[];
}

type LegacyFieldDef = string | RichFieldDef;
type LegacySchema = Record<string, LegacyFieldDef>;

// ── Normalizer: any schema format → FormSchemaV2 ────────────────────────────

let idCounter = 0;
function genId(): string {
  return `e${Date.now()}-${++idCounter}`;
}

function isV2(raw: unknown): raw is FormSchemaV2 {
  return typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>).version === 2;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function legacyToV2(raw: LegacySchema): FormSchemaV2 {
  const elements: FormElement[] = [];
  for (const [key, def] of Object.entries(raw)) {
    if (typeof def === 'string') {
      elements.push({
        kind: 'field',
        id: genId(),
        key,
        type: (FIELD_TYPES as readonly string[]).includes(def) ? def as FieldType : 'string',
        label: capitalize(key),
        placeholder: '',
        required: true,
      });
    } else {
      elements.push({
        kind: 'field',
        id: genId(),
        key,
        type: (FIELD_TYPES as readonly string[]).includes(def.type) ? def.type as FieldType : 'string',
        label: def.label ?? capitalize(key),
        placeholder: def.placeholder ?? '',
        required: def.required ?? true,
        pattern: def.pattern,
        options: def.options,
      });
    }
  }
  return { version: 2, elements };
}

export function normalizeSchema(raw: unknown): FormSchemaV2 {
  if (!raw || typeof raw !== 'object') {
    return { version: 2, elements: [] };
  }
  if (isV2(raw)) {
    return raw;
  }
  return legacyToV2(raw as LegacySchema);
}

// ── Helper: extract only field elements ─────────────────────────────────────

export function getFields(schema: FormSchemaV2): FieldElement[] {
  return schema.elements.filter((e): e is FieldElement => e.kind === 'field');
}

// ── Helper: create empty form data from schema ─────────────────────────────

export function createEmptyFormData(schema: FormSchemaV2): Record<string, string> {
  const data: Record<string, string> = {};
  for (const el of schema.elements) {
    if (el.kind === 'field') {
      data[el.key] = '';
    }
  }
  return data;
}

// ── Helper: convert form data to typed payload ──────────────────────────────

export function formDataToPayload(schema: FormSchemaV2, formData: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const el of schema.elements) {
    if (el.kind !== 'field') continue;
    const raw = formData[el.key] ?? '';
    if (!el.required && raw === '') continue;
    if (el.type === 'integer') payload[el.key] = parseInt(raw) || 0;
    else if (el.type === 'boolean') payload[el.key] = raw === 'true';
    else payload[el.key] = raw;
  }
  return payload;
}

// ── Helper: create a new empty element ──────────────────────────────────────

export function createFieldElement(type: FieldType = 'string'): FieldElement {
  return {
    kind: 'field',
    id: genId(),
    key: '',
    type,
    label: '',
    placeholder: '',
    required: true,
    options: type === 'select' || type === 'poll' ? [''] : null,
  };
}

export function createSectionElement(): SectionElement {
  return {
    kind: 'section',
    id: genId(),
    title: '',
    description: '',
  };
}
