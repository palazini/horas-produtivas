import { supabase } from '../../lib/supabaseClient'

export type MachineLite = {
  id: string
  sector_id: string
  code: string
  name_display: string
  is_active: boolean
  sector?: { id: string; name: string }
}

export type TargetDefaultRow = { machine_id: string; month: string; daily_target: number }
export type TargetDailyRow = { machine_id: string; day: string; target_hours: number }

export async function fetchMachinesLite() {
  const { data, error } = await supabase
    .from('machines')
    .select('id,sector_id,code,name_display,is_active,sector:sectors(id,name)')
    .order('code', { ascending: true })

  if (error) throw error

  return (data ?? []).map((row) => ({
    ...row,
    sector: Array.isArray(row.sector) ? row.sector[0] : row.sector,
  })) as MachineLite[]
}

export async function fetchTargetsDefaults(monthStart: string) {
  const { data, error } = await supabase
    .from('targets_daily_defaults')
    .select('machine_id,month,daily_target')
    .eq('month', monthStart)

  if (error) throw error
  return (data ?? []) as TargetDefaultRow[]
}

export async function upsertTargetDefault(row: TargetDefaultRow) {
  const { error } = await supabase
    .from('targets_daily_defaults')
    .upsert(row, { onConflict: 'month,machine_id' })
  if (error) throw error
}

export async function fetchTargetsDaily(dateFrom: string, dateTo: string, machineId?: string) {
  let q = supabase
    .from('targets_daily')
    .select('machine_id,day,target_hours')
    .gte('day', dateFrom)
    .lte('day', dateTo)
    .order('day', { ascending: true })

  if (machineId) q = q.eq('machine_id', machineId)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as TargetDailyRow[]
}

export async function upsertTargetDaily(row: TargetDailyRow) {
  const { error } = await supabase
    .from('targets_daily')
    .upsert(row, { onConflict: 'day,machine_id' })
  if (error) throw error
}

export async function deleteTargetDaily(machineId: string, day: string) {
  const { error } = await supabase
    .from('targets_daily')
    .delete()
    .eq('machine_id', machineId)
    .eq('day', day)
  if (error) throw error
}

export async function upsertAllTargetsZero(day: string, machineIds: string[]) {
  const rows = machineIds.map((machine_id) => ({ machine_id, day, target_hours: 0 }))
  const { error } = await supabase
    .from('targets_daily')
    .upsert(rows, { onConflict: 'day,machine_id' })
  if (error) throw error
}

export async function copyTargetsDefaults(sourceMonth: string, targetMonth: string) {
  // 1. Busca metas do mês origem
  const source = await fetchTargetsDefaults(sourceMonth)
  if (!source.length) return 0

  // 2. Cria novas metas para o mês destino
  const rows = source.map((r) => ({
    machine_id: r.machine_id,
    month: targetMonth,
    daily_target: r.daily_target,
  }))

  // 3. Upsert (sobrescreve se existir)
  const { error } = await supabase
    .from('targets_daily_defaults')
    .upsert(rows, { onConflict: 'month,machine_id' })
  if (error) throw error

  return rows.length
}
