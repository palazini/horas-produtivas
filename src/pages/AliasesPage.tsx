import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActiveBatchId, setActiveBatchId } from '../features/import/uploadBatch'
import {
  createMachine,
  fetchBatch,
  fetchConfiguredAliases,
  fetchLatestBatchId,
  fetchMachinesAll,
  fetchPendingAliases,
  fetchSectors,
  processBatch,
  upsertAlias,
  type ConfiguredAlias,
  type PendingAlias,
  type Sector,
  type Machine,
} from '../features/aliases/aliasesService'

function suggestCanonical(raw: string) {
  let s = String(raw ?? '').trim().toUpperCase()
  s = s.replace(/^CE[-\s_]*/i, '') // remove CE-
  s = s.replace(/\s+/g, ' ').trim()

  if (/^[A-Z]{2,}\s+[A-Z]{2,}$/.test(s)) return s.replace(/\s+/g, '-')

  const spaced = s.match(/^([A-Z]+)\s+(\d+)$/)
  if (spaced) return `${spaced[1]}-${spaced[2]}`

  const stuck = s.match(/^([A-Z]+)(\d+)$/)
  if (stuck) return `${stuck[1]}-${stuck[2]}`

  return s.replace(/\s+/g, '-')
}

function shortId(id: string) {
  return id ? `${id.slice(0, 8)}…${id.slice(-4)}` : ''
}

export function AliasesPage() {
  const nav = useNavigate()

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [batchId, setBatchId] = useState<string | null>(getActiveBatchId())
  const [batch, setBatch] = useState<any>(null)

  const [pending, setPending] = useState<PendingAlias[]>([])
  const [selected, setSelected] = useState<PendingAlias | null>(null)
  const [configuredAliases, setConfiguredAliases] = useState<ConfiguredAlias[]>([])
  const [selectedConfigured, setSelectedConfigured] = useState<ConfiguredAlias | null>(null)
  const [viewTab, setViewTab] = useState<'pending' | 'configured'>('pending')

  const [sectors, setSectors] = useState<Sector[]>([])
  const [machines, setMachines] = useState<Machine[]>([])

  // Painel (mapeamento / criação)
  const [mode, setMode] = useState<'existing' | 'create'>('existing')
  const [selectedMachineId, setSelectedMachineId] = useState<string>('')

  const [sectorId, setSectorId] = useState<string>('')

  const [machineCode, setMachineCode] = useState('')
  const [machineDisplay, setMachineDisplay] = useState('')

  const machineOptions = useMemo(() => {
    return machines.map((m) => {
      const sec = m.sector?.name ?? '—'
      const label = `${sec} — ${m.code}`
      return { id: m.id, label }
    })
  }, [machines])

  async function loadAll(targetBatchId: string) {
    setErr(null)
    setBusy(true)
    try {
      const [b, p, s, ms, ca] = await Promise.all([
        fetchBatch(targetBatchId),
        fetchPendingAliases(targetBatchId),
        fetchSectors(),
        fetchMachinesAll(),
        fetchConfiguredAliases(),
      ])
      setBatch(b)
      setPending(p)
      setSelected(p[0] ?? null)
      setSectors(s)
      setMachines(ms)
      setConfiguredAliases(ca)
      setSectorId((prev) => prev || s[0]?.id || '')
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao carregar dados.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    ; (async () => {
      let id = batchId
      if (!id) {
        const latest = await fetchLatestBatchId()
        if (latest) {
          id = latest
          setActiveBatchId(latest)
          setBatchId(latest)
        }
      }
      if (id) await loadAll(id)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // quando seleciona alias, pré-preenche sugestão de máquina
  useEffect(() => {
    if (!selected) return
    const sug = suggestCanonical(selected.machine_raw)
    setMachineCode(sug)
    setMachineDisplay(sug)
    setSelectedMachineId('')
    setMode('existing')
  }, [selected])

  const canApply =
    !!batchId &&
    !!selected &&
    ((mode === 'existing' && !!selectedMachineId) ||
      (mode === 'create' && !!sectorId && !!machineCode.trim() && !!machineDisplay.trim()))

  async function applyMapping() {
    if (!batchId || !selected) return
    setBusy(true)
    setErr(null)
    try {
      let machineIdToUse = selectedMachineId

      if (mode === 'create') {
        const m = await createMachine({
          sector_id: sectorId,
          code: machineCode.trim().toUpperCase(),
          name_display: machineDisplay.trim(),
        })
        machineIdToUse = m.id
        setMachines(await fetchMachinesAll())
      }

      await upsertAlias({
        alias_raw: selected.machine_raw,
        alias_norm: selected.alias_norm,
        machine_id: machineIdToUse,
      })

      await processBatch(batchId)
      await loadAll(batchId)

      const b = await fetchBatch(batchId)
      setBatch(b)
      if (b.status === 'ready') nav('/results')
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao aplicar alias.')
    } finally {
      setBusy(false)
    }
  }

  async function forceReprocess() {
    if (!batchId) return
    setBusy(true)
    setErr(null)
    try {
      await processBatch(batchId)
      await loadAll(batchId)
      const b = await fetchBatch(batchId)
      setBatch(b)
      if (b.status === 'ready') nav('/results')
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao reprocessar.')
    } finally {
      setBusy(false)
    }
  }

  async function updateConfiguredAlias() {
    if (!selectedConfigured || !selectedMachineId) return
    setBusy(true)
    setErr(null)
    try {
      await upsertAlias({
        alias_raw: selectedConfigured.alias_raw,
        alias_norm: selectedConfigured.alias_norm,
        machine_id: selectedMachineId,
      })
      const ca = await fetchConfiguredAliases()
      setConfiguredAliases(ca)
      setSelectedConfigured(null)
      setSelectedMachineId('')
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao atualizar alias.')
    } finally {
      setBusy(false)
    }
  }

  const statusBadge = useMemo(() => {
    if (!batch?.status) return { class: 'badge-neutral', label: '—' }
    switch (batch.status) {
      case 'ready':
        return { class: 'badge-success', label: 'Ready' }
      case 'needs_alias':
        return { class: 'badge-warning', label: 'Needs Alias' }
      case 'uploaded':
        return { class: 'badge-info', label: 'Uploaded' }
      default:
        return { class: 'badge-neutral', label: batch.status }
    }
  }, [batch?.status])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem', overflow: 'hidden' }}>
      {/* Header */}
      <div className="card">
        <div className="card-body">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="page-title section-header">Resolver Aliases</h1>
              <p className="page-subtitle mt-2">
                Mapeie as "Categorias" do Excel para máquinas canônicas (ex.: CE-TCN12 → TCN-12)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={forceReprocess} disabled={!batchId || busy} className="btn btn-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
                Reprocessar
              </button>
              <button onClick={() => nav('/results')} className="btn btn-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
                Ver Resultados
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mt-5">
            <div className="metric-card">
              <div className="metric-label">Batch ID</div>
              <div className="metric-value-sm font-mono">{batchId ? shortId(batchId) : '—'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Status</div>
              <div className="mt-1.5">
                <span className={`badge ${statusBadge.class}`}>{statusBadge.label}</span>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Referência</div>
              <div className="metric-value-sm">{batch?.ref_date ?? '—'}</div>
            </div>
            <div className="metric-card">
              <div className="flex items-center justify-between">
                <div className="metric-label">Pendências</div>
                {pending.length > 0 && <span className="badge badge-warning">{pending.length}</span>}
              </div>
              <div className="metric-value-sm">{pending.length} itens</div>
            </div>
          </div>

          {err && (
            <div className="alert alert-error mt-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
              <span>{err}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-[520px_1fr]">
        {/* Left: pending list / configured list */}
        <div className="card" style={{ maxHeight: 'calc(100vh - 280px)', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="icon-box">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {viewTab === 'pending' ? 'Pendências Detectadas' : 'Aliases Configurados'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {viewTab === 'pending' ? 'Clique em uma linha para mapear' : `${configuredAliases.length} aliases cadastrados`}
                  </div>
                </div>
              </div>
              {/* Tab toggle */}
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button
                  onClick={() => setViewTab('pending')}
                  className={`tab ${viewTab === 'pending' ? 'active' : ''}`}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Pendências
                  {pending.length > 0 && <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: 10 }}>{pending.length}</span>}
                </button>
                <button
                  onClick={() => setViewTab('configured')}
                  className={`tab ${viewTab === 'configured' ? 'active' : ''}`}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Configurados
                  <span className="badge badge-secondary" style={{ marginLeft: 6, fontSize: 10 }}>{configuredAliases.length}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {viewTab === 'pending' ? (
              <>
                {busy && pending.length === 0 ? (
                  <div className="p-6 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                    <svg className="animate-spin mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Carregando…
                  </div>
                ) : pending.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3"
                      style={{ background: 'var(--color-success-light)' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                        stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Nenhuma pendência
                    </div>
                    <div className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      Você pode ir para Resultados
                    </div>
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Categoria (Excel)</th>
                        <th style={{ textAlign: 'right' }}>Horas</th>
                        <th style={{ textAlign: 'right' }}>Linhas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((p) => {
                        const active = selected?.alias_norm === p.alias_norm
                        return (
                          <tr
                            key={p.alias_norm}
                            onClick={() => { setSelected(p); setSelectedConfigured(null) }}
                            className={active ? 'active' : ''}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                {p.machine_raw}
                              </div>
                              <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                Sugestão:{' '}
                                <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                                  {suggestCanonical(p.machine_raw)}
                                </span>
                              </div>
                              <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                {p.day_min} → {p.day_max}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="font-semibold">{p.hours_total}</span>
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>{p.row_count}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              <>
                {busy && configuredAliases.length === 0 ? (
                  <div className="p-6 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                    <svg className="animate-spin mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Carregando…
                  </div>
                ) : configuredAliases.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3"
                      style={{ background: 'var(--color-surface-2)' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                        stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </div>
                    <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Nenhum alias configurado
                    </div>
                    <div className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      Mapeie pendências para criar aliases
                    </div>
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Alias (Excel)</th>
                        <th>Máquina</th>
                        <th>Setor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {configuredAliases.map((a) => {
                        const active = selectedConfigured?.id === a.id
                        return (
                          <tr
                            key={a.id}
                            onClick={() => {
                              setSelectedConfigured(a)
                              setSelected(null)
                              setSelectedMachineId(a.machine_id)
                            }}
                            className={active ? 'active' : ''}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                {a.alias_raw}
                              </div>
                              <div className="mt-0.5 text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                                {a.alias_norm}
                              </div>
                            </td>
                            <td>
                              <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                                {a.machine_code}
                              </span>
                            </td>
                            <td style={{ color: 'var(--color-text-secondary)' }}>
                              {a.sector_name}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: mapping panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="card-body" style={{ flex: 1, overflow: 'auto' }}>
            {selectedConfigured ? (
              <div className="space-y-6">
                {/* Selected configured alias info */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="label">Alias Configurado</div>
                    <div className="text-xl font-bold mt-1" style={{ color: 'var(--color-text-primary)' }}>
                      {selectedConfigured.alias_raw}
                    </div>
                    <div className="text-xs mt-1 font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                      alias_norm: {selectedConfigured.alias_norm}
                    </div>
                  </div>

                  <div className="metric-card text-right" style={{ minWidth: '140px' }}>
                    <div className="metric-label">Máquina Atual</div>
                    <div className="metric-value-sm" style={{ color: 'var(--color-accent)' }}>
                      {selectedConfigured.machine_code}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      {selectedConfigured.sector_name}
                    </div>
                  </div>
                </div>

                <div className="divider" />

                <div>
                  <label className="label">Alterar máquina vinculada</label>
                  <select value={selectedMachineId} onChange={(e) => setSelectedMachineId(e.target.value)} className="select">
                    <option value="">— escolha —</option>
                    {machineOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="divider" />

                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => { setSelectedConfigured(null); setSelectedMachineId('') }}
                    className="btn btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={updateConfiguredAlias}
                    disabled={!selectedMachineId || selectedMachineId === selectedConfigured.machine_id || busy}
                    className="btn btn-accent"
                    style={{ minWidth: '140px' }}
                  >
                    {busy ? (
                      <>
                        <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                          strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Salvando…
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        Salvar alteração
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : !selected ? (
              <div className="py-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3"
                  style={{ background: 'var(--color-surface-2)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 15-6-6" />
                    <path d="M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
                  </svg>
                </div>
                <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {viewTab === 'pending' ? 'Selecione uma pendência' : 'Selecione um alias'}
                </div>
                <div className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  {viewTab === 'pending' ? 'Escolha um item à esquerda para mapear' : 'Clique em um alias para ver detalhes ou editar'}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Selected info */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="label">Categoria (Excel)</div>
                    <div className="text-xl font-bold mt-1" style={{ color: 'var(--color-text-primary)' }}>
                      {selected.machine_raw}
                    </div>
                    <div className="text-xs mt-1 font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                      alias_norm: {selected.alias_norm}
                    </div>
                  </div>

                  <div className="metric-card text-right" style={{ minWidth: '120px' }}>
                    <div className="metric-label">Impacto</div>
                    <div className="metric-value">{selected.hours_total}h</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      {selected.row_count} linhas
                    </div>
                  </div>
                </div>

                <div className="divider" />

                {/* Mode tabs */}
                <div className="tabs">
                  <button onClick={() => setMode('existing')} className={`tab ${mode === 'existing' ? 'active' : ''}`}>
                    <span className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      Vincular existente
                    </span>
                  </button>
                  <button onClick={() => setMode('create')} className={`tab ${mode === 'create' ? 'active' : ''}`}>
                    <span className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                      Criar nova
                    </span>
                  </button>
                </div>

                {mode === 'existing' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="label">Selecione a máquina</label>
                      <select value={selectedMachineId} onChange={(e) => setSelectedMachineId(e.target.value)} className="select">
                        <option value="">— escolha —</option>
                        {machineOptions.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg text-sm"
                      style={{ background: 'var(--color-info-light)', border: '1px solid #bae6fd' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke="var(--color-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className="shrink-0 mt-0.5">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                      </svg>
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        Cadastre máquinas em <strong>Estrutura</strong> se a lista estiver vazia.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <label className="label">Setor</label>
                      <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} className="select">
                        <option value="">— selecione —</option>
                        {sectors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="label">Código canônico</label>
                        <input value={machineCode} onChange={(e) => setMachineCode(e.target.value)} className="input" placeholder="ex: TCN-12" />
                      </div>
                      <div>
                        <label className="label">Nome de exibição</label>
                        <input value={machineDisplay} onChange={(e) => setMachineDisplay(e.target.value)} className="input" placeholder="ex: TCN-12" />
                      </div>
                    </div>

                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      Dica: o setor é só para agrupamento visual. O alias é sempre vinculado à máquina.
                    </div>
                  </div>
                )}

                <div className="divider" />

                <div className="flex items-center justify-end">
                  <button onClick={applyMapping} disabled={!canApply || busy} className="btn btn-accent" style={{ minWidth: '160px' }}>
                    {busy ? (
                      <>
                        <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                          strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Aplicando…
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        Aplicar alias
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
