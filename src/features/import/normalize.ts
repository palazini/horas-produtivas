export function normalizeAlias(raw: string) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^A-Z0-9]/g, '')       // remove separadores
}

export function toNumberHours(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v).trim().replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function excelSerialToUTCDate(serial: number): Date {
  // Excel serial (Windows): dia 1 = 1900-01-01 (com bug do 1900)
  // Aproximação padrão: 25569 = 1970-01-01
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms)
}

export function parseDay(value: unknown): string | null {
  if (value == null) return null

  // Date já pronto
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Excel serial
  if (typeof value === 'number' && Number.isFinite(value)) {
    const dt = excelSerialToUTCDate(value)
    const y = dt.getUTCFullYear()
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dt.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // string
  const s = String(value).trim()
  // tenta YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  const dt = new Date(s)
  if (!Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const d = String(dt.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return null
}
