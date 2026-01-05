import * as XLSX from 'xlsx'
import { normalizeAlias, parseDay, toNumberHours } from './normalize'

export type NormalizedRow = {
  prod_day: string
  machine_raw: string
  alias_norm: string
  hours: number
}

export type ParseResult = {
  rows: NormalizedRow[]
  stats: {
    rowCount: number
    dayMin?: string
    dayMax?: string
    machines: number
    hoursTotal: number
  }
  refDate?: string
  yearMonth?: string
}

function normHeaderCell(v: unknown) {
  return String(v ?? '').trim().toLowerCase()
}

export async function parseWipXlsx(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('Planilha não encontrada.')

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][]
  if (!aoa.length) throw new Error('Planilha vazia.')

  const required = ['data do wip', 'alíquota', 'categoria']

  let headerRow = -1
  for (let i = 0; i < Math.min(30, aoa.length); i++) {
    const row = aoa[i] ?? []
    const cols = row.map(normHeaderCell)
    const ok = required.every((r) => cols.includes(r))
    if (ok) { headerRow = i; break }
  }
  if (headerRow < 0) {
    throw new Error('Cabeçalho não encontrado. Preciso das colunas: Data do WIP, Alíquota, Categoria.')
  }

  const header = aoa[headerRow].map(normHeaderCell)
  const idxDay = header.indexOf('data do wip')
  const idxHours = header.indexOf('alíquota')
  const idxCat = header.indexOf('categoria')

  const rows: NormalizedRow[] = []

  for (let i = headerRow + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? []

    // ignora linha "Total" (em qualquer coluna)
    const hasTotal = r.some((c: any) => typeof c === 'string' && c.trim().toLowerCase() === 'total')
    if (hasTotal) continue

    const day = parseDay(r[idxDay])
    const hours = toNumberHours(r[idxHours])
    const cat = String(r[idxCat] ?? '').trim()

    if (!day || !cat || hours == null) continue
    // Permitir negativos (estornos)
    // if (hours <= 0) continue

    rows.push({
      prod_day: day,
      machine_raw: cat,
      alias_norm: normalizeAlias(cat),
      hours,
    })
  }

  // stats
  const days = rows.map((x) => x.prod_day).sort()
  const dayMin = days[0]
  const dayMax = days[days.length - 1]
  const machines = new Set(rows.map((x) => x.alias_norm)).size
  const hoursTotal = rows.reduce((acc, x) => acc + x.hours, 0)

  const refDate = dayMax
  const yearMonth = refDate ? `${refDate.slice(0, 7)}-01` : undefined

  return {
    rows,
    stats: {
      rowCount: rows.length,
      dayMin,
      dayMax,
      machines,
      hoursTotal: Math.round(hoursTotal * 100) / 100,
    },
    refDate,
    yearMonth,
  }
}
