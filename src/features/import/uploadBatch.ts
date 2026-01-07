import { supabase } from '../../lib/supabaseClient'
import type { NormalizedRow } from './parseWipXlsx'

export type UploadOutcome =
  | { ok: true; batchId: string; status: 'ready' | 'needs_alias'; unresolvedCount: number }
  | { ok: false; message: string }

const ACTIVE_BATCH_LS = 'prodmetas_active_batch'

export function setActiveBatchId(id: string) {
  localStorage.setItem(ACTIVE_BATCH_LS, id)
}
export function getActiveBatchId() {
  return localStorage.getItem(ACTIVE_BATCH_LS)
}

export async function uploadAndProcessBatch(input: {
  rows: NormalizedRow[]
  refDate?: string
  yearMonth?: string
}): Promise<UploadOutcome> {
  try {
    // 0) Extrai os dias únicos do arquivo para deletar dados antigos
    const uniqueDays = [...new Set(input.rows.map(r => r.prod_day))]

    if (uniqueDays.length > 0 && input.yearMonth) {
      // Buscar batches existentes do mesmo mês
      const { data: existingBatches } = await supabase
        .from('production_batches')
        .select('id')
        .eq('year_month', input.yearMonth)
        .eq('status', 'ready')

      if (existingBatches?.length) {
        const existingBatchIds = existingBatches.map(b => b.id)

        // Deletar dados consolidados antigos desses dias específicos
        await supabase
          .from('daily_machine_hours')
          .delete()
          .in('batch_id', existingBatchIds)
          .in('prod_day', uniqueDays)

        // Deletar linhas brutas antigas desses dias
        await supabase
          .from('production_rows')
          .delete()
          .in('batch_id', existingBatchIds)
          .in('prod_day', uniqueDays)
      }
    }

    // 1) cria batch
    const { data: batch, error: e1 } = await supabase
      .from('production_batches')
      .insert({
        status: 'uploaded',
        ref_date: input.refDate ?? null,
        year_month: input.yearMonth ?? null,
        row_count: input.rows.length,
        note: 'upload via web',
      })
      .select()
      .single()

    if (e1 || !batch) return { ok: false, message: e1?.message ?? 'Falha ao criar batch.' }

    // 2) insere linhas (chunk)
    const chunkSize = 500
    for (let i = 0; i < input.rows.length; i += chunkSize) {
      const chunk = input.rows.slice(i, i + chunkSize).map((r) => ({
        batch_id: batch.id,
        prod_day: r.prod_day,
        machine_raw: r.machine_raw,
        alias_norm: r.alias_norm,
        hours: r.hours,
      }))

      const { error } = await supabase.from('production_rows').insert(chunk)
      if (error) return { ok: false, message: error.message }
    }

    // 3) processa
    const { error: e3 } = await supabase.rpc('process_production_batch', { p_batch_id: batch.id })
    if (e3) return { ok: false, message: e3.message }

    // 4) lê status final
    const { data: finalBatch, error: e4 } = await supabase
      .from('production_batches')
      .select('*')
      .eq('id', batch.id)
      .single()

    if (e4 || !finalBatch) return { ok: false, message: e4?.message ?? 'Falha ao ler batch.' }

    setActiveBatchId(batch.id)

    return {
      ok: true,
      batchId: batch.id,
      status: finalBatch.status,
      unresolvedCount: finalBatch.unresolved_count ?? 0,
    }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? 'Erro inesperado.' }
  }
}
