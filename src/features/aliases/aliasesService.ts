import { supabase } from '../../lib/supabaseClient'

export type Sector = { id: string; name: string; sort_order: number }

export type Machine = {
  id: string
  sector_id: string
  code: string
  name_display: string
  is_active: boolean
  sort_order: number
  sector?: { id: string; name: string; sort_order: number }
}

export type PendingAlias = {
  batch_id: string
  alias_norm: string
  machine_raw: string
  row_count: number
  hours_total: number
  day_min: string
  day_max: string
}

export async function fetchLatestBatchId() {
  const { data, error } = await supabase
    .from('production_batches')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.id ?? null
}

export async function fetchBatch(batchId: string) {
  const { data, error } = await supabase
    .from('production_batches')
    .select('*')
    .eq('id', batchId)
    .single()

  if (error) throw error
  return data
}

export async function fetchPendingAliases(batchId: string) {
  const { data, error } = await supabase
    .from('v_batch_pending_aliases')
    .select('batch_id,alias_norm,machine_raw,row_count,hours_total,day_min,day_max')
    .eq('batch_id', batchId)
    .order('hours_total', { ascending: false })

  if (error) throw error
  return (data ?? []) as PendingAlias[]
}

export async function fetchSectors() {
  const { data, error } = await supabase
    .from('sectors')
    .select('id,name,sort_order')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as Sector[]
}

export async function fetchMachinesAll() {
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
      code: input.code,
      name_display: input.name_display,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
    })
    .select('id,sector_id,code,name_display,is_active,sort_order')
    .single()

  if (error) throw error
  return data as Machine
}

export async function upsertAlias(input: { alias_raw: string; alias_norm: string; machine_id: string }) {
  const { error } = await supabase
    .from('machine_aliases')
    .upsert(input, { onConflict: 'alias_norm' })

  if (error) throw error
}

export async function processBatch(batchId: string) {
  const { error } = await supabase.rpc('process_production_batch', { p_batch_id: batchId })
  if (error) throw error
}

export type ConfiguredAlias = {
  id: string
  alias_raw: string
  alias_norm: string
  machine_id: string
  machine_code: string
  machine_name: string
  sector_name: string
  created_at: string
}

export async function fetchConfiguredAliases() {
  const { data, error } = await supabase
    .from('machine_aliases')
    .select(`
      id,
      alias_raw,
      alias_norm,
      machine_id,
      created_at,
      machine:machines(code, name_display, sector:sectors(name))
    `)
    .order('alias_norm', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => {
    const machine = Array.isArray(row.machine) ? row.machine[0] : row.machine
    const sector = machine?.sector
    const sectorObj = Array.isArray(sector) ? sector[0] : sector
    return {
      id: row.id,
      alias_raw: row.alias_raw,
      alias_norm: row.alias_norm,
      machine_id: row.machine_id,
      machine_code: machine?.code ?? '—',
      machine_name: machine?.name_display ?? '—',
      sector_name: sectorObj?.name ?? '—',
      created_at: row.created_at,
    }
  }) as ConfiguredAlias[]
}
