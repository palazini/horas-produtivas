import { supabase } from '../../lib/supabaseClient'

export type ReadyBatch = {
  id: string
  created_at: string
  status: 'uploaded' | 'needs_alias' | 'ready' | 'error'
  ref_date: string | null
  year_month: string | null
  row_count: number | null
  unresolved_count: number | null
  note: string | null
}

export type SectorRow = {
  id: string
  name: string
  sort_order: number
}

export type MachineRow = {
  id: string
  sector_id: string
  code: string
  name_display: string
  is_active: boolean
  sort_order: number
  sector: SectorRow
}

export type DailyHourRow = {
  id: string
  prod_day: string
  hours: number
  machine: MachineRow
}

export type TargetDaily = { machine_id: string; target_hours: number; day: string }
export type TargetDefault = { machine_id: string; month: string; daily_target: number }

export async function fetchLatestReadyBatch() {
  const { data, error } = await supabase
    .from('production_batches')
    .select('*')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as ReadyBatch | null
}

export async function fetchReadyBatchForMonth(yearMonth: string) {
  const { data, error } = await supabase
    .from('production_batches')
    .select('*')
    .eq('status', 'ready')
    .eq('year_month', yearMonth)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as ReadyBatch | null
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
  })) as MachineRow[]
}

export async function fetchDailyHoursForBatch(batchId: string, dateFrom: string, dateTo: string) {
  const { data, error } = await supabase
    .from('daily_machine_hours')
    .select(
      'id,prod_day,hours,machine:machines(id,sector_id,code,name_display,is_active,sort_order,sector:sectors(id,name,sort_order))'
    )
    .eq('batch_id', batchId)
    .gte('prod_day', dateFrom)
    .lte('prod_day', dateTo)

  if (error) throw error

  return (data ?? []).map((row) => {
    const machineRaw = Array.isArray(row.machine) ? row.machine[0] : row.machine
    return {
      ...row,
      machine: machineRaw ? {
        ...machineRaw,
        sector: Array.isArray(machineRaw.sector) ? machineRaw.sector[0] : machineRaw.sector,
      } : machineRaw,
    }
  }) as DailyHourRow[]
}

export type RawProductionRow = {
  id: string
  prod_day: string
  machine_raw: string
  hours: number
}

// Busca TODOS os batches ready de um mês (para consolidar dados de múltiplos uploads)
export async function fetchAllReadyBatchesForMonth(yearMonth: string) {
  const { data, error } = await supabase
    .from('production_batches')
    .select('*')
    .eq('status', 'ready')
    .eq('year_month', yearMonth)
    .order('ref_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as ReadyBatch[]
}

// Busca horas consolidadas SEM filtrar por batch - junta dados de todos os batches ready do mês
export async function fetchDailyHoursForMonth(yearMonth: string, dateFrom: string, dateTo: string) {
  // Primeiro busca todos os batch IDs ready para este mês
  const { data: batches, error: batchError } = await supabase
    .from('production_batches')
    .select('id')
    .eq('status', 'ready')
    .eq('year_month', yearMonth)

  if (batchError) throw batchError
  if (!batches?.length) return []

  const batchIds = batches.map(b => b.id)

  const { data, error } = await supabase
    .from('daily_machine_hours')
    .select(
      'id,prod_day,hours,batch_id,machine:machines(id,sector_id,code,name_display,is_active,sort_order,sector:sectors(id,name,sort_order))'
    )
    .in('batch_id', batchIds)
    .gte('prod_day', dateFrom)
    .lte('prod_day', dateTo)

  if (error) throw error

  return (data ?? []).map((row) => {
    const machineRaw = Array.isArray(row.machine) ? row.machine[0] : row.machine
    return {
      ...row,
      machine: machineRaw ? {
        ...machineRaw,
        sector: Array.isArray(machineRaw.sector) ? machineRaw.sector[0] : machineRaw.sector,
      } : machineRaw,
    }
  }) as (DailyHourRow & { batch_id: string })[]
}

export async function fetchRawRowsForMachine(batchIds: string | string[], machineId: string, days: string[]) {
  if (!days.length) return []

  const ids = Array.isArray(batchIds) ? batchIds : [batchIds]

  const { data, error } = await supabase
    .from('production_rows')
    .select('id, prod_day, machine_raw, hours')
    .in('batch_id', ids)
    .eq('machine_id', machineId)
    .in('prod_day', days)
    .order('prod_day', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as RawProductionRow[]
}

export async function fetchTargetsDefaults(monthStart: string) {
  const { data, error } = await supabase
    .from('targets_daily_defaults')
    .select('machine_id,month,daily_target')
    .eq('month', monthStart)

  if (error) throw error
  return (data ?? []) as TargetDefault[]
}

export async function fetchTargetsDaily(dateFrom: string, dateTo: string) {
  const { data, error } = await supabase
    .from('targets_daily')
    .select('machine_id,target_hours,day')
    .gte('day', dateFrom)
    .lte('day', dateTo)

  if (error) throw error
  return (data ?? []) as TargetDaily[]
}
