import { supabase } from '../../lib/supabaseClient'

export type Sector = {
  id: string
  name: string
  sort_order: number
}

export type Machine = {
  id: string
  sector_id: string
  code: string
  name_display: string
  is_active: boolean
  sort_order: number
  sector?: { id: string; name: string; sort_order: number }
}

function upper(s: string) {
  return String(s ?? '').trim().toUpperCase()
}

export async function fetchSectors() {
  const { data, error } = await supabase
    .from('sectors')
    .select('id,name,sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as Sector[]
}

export async function fetchMachines() {
  const { data, error } = await supabase
    .from('machines')
    .select('id,sector_id,code,name_display,is_active,sort_order,sector:sectors(id,name,sort_order)')
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true })

  if (error) throw error

  return (data ?? []).map((row) => ({
    ...row,
    sector: Array.isArray(row.sector) ? row.sector[0] : row.sector,
  })) as Machine[]
}

/** Opcional (mas útil): criar setor */
export async function createSector(input: { name: string; sort_order?: number }) {
  const { data, error } = await supabase
    .from('sectors')
    .insert({
      name: input.name.trim(),
      sort_order: input.sort_order ?? 0,
    })
    .select('id,name,sort_order')
    .single()

  if (error) throw error
  return data as Sector
}

/** Opcional: editar setor */
export async function updateSector(sectorId: string, patch: Partial<Pick<Sector, 'name' | 'sort_order'>>) {
  const { error } = await supabase.from('sectors').update(patch).eq('id', sectorId)
  if (error) throw error
}

export async function createMachine(input: {
  sector_id: string
  code: string
  name_display: string
  sort_order?: number
  is_active?: boolean
}) {
  const { data, error } = await supabase
    .from('machines')
    .insert({
      sector_id: input.sector_id,
      code: upper(input.code),
      name_display: input.name_display.trim(),
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
    })
    .select('id,sector_id,code,name_display,is_active,sort_order')
    .single()

  if (error) throw error
  return data as Machine
}

export async function updateMachine(
  machineId: string,
  patch: Partial<Pick<Machine, 'sector_id' | 'code' | 'name_display' | 'sort_order' | 'is_active'>>
) {
  const finalPatch: any = { ...patch }
  if (finalPatch.code !== undefined) finalPatch.code = upper(finalPatch.code)
  if (finalPatch.name_display !== undefined) finalPatch.name_display = String(finalPatch.name_display ?? '').trim()

  const { error } = await supabase.from('machines').update(finalPatch).eq('id', machineId)
  if (error) throw error
}
