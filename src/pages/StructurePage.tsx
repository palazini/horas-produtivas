import { useEffect, useMemo, useState } from 'react'
import {
  createMachine,
  createSector,
  fetchMachines,
  fetchSectors,
  updateMachine,
  updateSector,
  type Machine,
  type Sector,
} from '../features/structure/structureService'

function upper(s: string) {
  return String(s ?? '').trim().toUpperCase()
}

export function StructurePage() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [sectors, setSectors] = useState<Sector[]>([])
  const [machines, setMachines] = useState<Machine[]>([])

  const [sectorId, setSectorId] = useState<string>('')

  // Modais
  const [showSectorModal, setShowSectorModal] = useState(false)
  const [showMachineModal, setShowMachineModal] = useState(false)
  const [editingSector, setEditingSector] = useState<Sector | null>(null)
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null)

  // Form fields
  const [formSectorName, setFormSectorName] = useState('')
  const [formSectorOrder, setFormSectorOrder] = useState('0')
  const [formMachineCode, setFormMachineCode] = useState('')
  const [formMachineDisplay, setFormMachineDisplay] = useState('')
  const [formMachineSector, setFormMachineSector] = useState('')
  const [formMachineOrder, setFormMachineOrder] = useState('0')
  const [formMachineActive, setFormMachineActive] = useState(true)

  async function load() {
    setBusy(true)
    setErr(null)
    try {
      const [s, m] = await Promise.all([fetchSectors(), fetchMachines()])
      setSectors(s)
      setMachines(m)
      setSectorId((prev) => prev || s[0]?.id || '')
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao carregar estrutura.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedSector = useMemo(() => sectors.find((s) => s.id === sectorId), [sectors, sectorId])

  const machinesForSelectedSector = useMemo(() => {
    return machines
      .filter((m) => m.sector_id === sectorId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.code.localeCompare(b.code))
  }, [machines, sectorId])

  // Abre modal para criar setor
  function openCreateSector() {
    setEditingSector(null)
    setFormSectorName('')
    setFormSectorOrder('0')
    setShowSectorModal(true)
  }

  // Abre modal para editar setor
  function openEditSector(s: Sector) {
    setEditingSector(s)
    setFormSectorName(s.name)
    setFormSectorOrder(String(s.sort_order ?? 0))
    setShowSectorModal(true)
  }

  // Abre modal para criar máquina
  function openCreateMachine() {
    setEditingMachine(null)
    setFormMachineCode('')
    setFormMachineDisplay('')
    setFormMachineSector(sectorId)
    setFormMachineOrder('0')
    setFormMachineActive(true)
    setShowMachineModal(true)
  }

  // Abre modal para editar máquina
  function openEditMachine(m: Machine) {
    setEditingMachine(m)
    setFormMachineCode(m.code)
    setFormMachineDisplay(m.name_display)
    setFormMachineSector(m.sector_id)
    setFormMachineOrder(String(m.sort_order ?? 0))
    setFormMachineActive(m.is_active)
    setShowMachineModal(true)
  }

  async function handleSaveSector() {
    if (!formSectorName.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const order = Number(formSectorOrder)
      if (editingSector) {
        await updateSector(editingSector.id, {
          name: formSectorName.trim(),
          sort_order: Number.isFinite(order) ? order : 0,
        })
      } else {
        const created = await createSector({
          name: formSectorName.trim(),
          sort_order: Number.isFinite(order) ? order : 0,
        })
        setSectorId(created.id)
      }
      setShowSectorModal(false)
      await load()
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao salvar setor.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveMachine() {
    if (!formMachineCode.trim() || !formMachineDisplay.trim() || !formMachineSector) return
    setBusy(true)
    setErr(null)
    try {
      const order = Number(formMachineOrder)
      if (editingMachine) {
        await updateMachine(editingMachine.id, {
          sector_id: formMachineSector,
          code: upper(formMachineCode),
          name_display: formMachineDisplay.trim(),
          sort_order: Number.isFinite(order) ? order : 0,
          is_active: formMachineActive,
        })
      } else {
        await createMachine({
          sector_id: formMachineSector,
          code: upper(formMachineCode),
          name_display: formMachineDisplay.trim(),
        })
      }
      setShowMachineModal(false)
      await load()
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao salvar máquina.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ gap: '1rem' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title section-header">Estrutura</h1>
          <p className="page-subtitle mt-1">
            Gerencie <strong>setores</strong> e <strong>máquinas</strong>. Os Aliases mapeiam as categorias do Excel.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {busy && (
            <span className="badge badge-neutral">
              <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Carregando…
            </span>
          )}
          <button onClick={load} disabled={busy} className="btn btn-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            Atualizar
          </button>
        </div>
      </div>

      {err && (
        <div className="alert alert-error">
          <span>{err}</span>
        </div>
      )}

      {/* Main Layout - 2 columns */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr] flex-1 min-h-0">
        {/* Sidebar - Setores */}
        <div className="flex flex-col gap-3">
          <div className="card flex-1">
            <div className="card-header" style={{ padding: '0.75rem 1rem' }}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <div className="icon-box" style={{ width: '1.75rem', height: '1.75rem' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    Setores
                  </span>
                </div>
                <button
                  onClick={openCreateSector}
                  className="btn btn-ghost"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '12px' }}
                  title="Novo setor"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="card-body" style={{ padding: '0.5rem' }}>
              <div className="flex flex-col gap-1">
                {sectors.map((s) => {
                  const isSelected = s.id === sectorId
                  const machineCount = machines.filter((m) => m.sector_id === s.id).length
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSectorId(s.id)}
                      className="group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all"
                      style={{
                        background: isSelected ? 'var(--color-accent-light)' : 'transparent',
                        border: isSelected ? '1px solid var(--color-accent-muted)' : '1px solid transparent',
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                        style={{
                          background: isSelected ? 'var(--color-accent)' : 'var(--color-surface-2)',
                          color: isSelected ? 'white' : 'var(--color-text-secondary)',
                        }}
                      >
                        {s.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-medium text-sm truncate"
                          style={{ color: isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)' }}
                        >
                          {s.name}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                          {machineCount} máquina{machineCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditSector(s)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/50 transition-opacity"
                        title="Editar setor"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Resumo compacto */}
          <div className="card">
            <div className="card-body" style={{ padding: '0.75rem 1rem' }}>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--color-text-secondary)' }}>Total setores</span>
                <span className="font-bold" style={{ color: 'var(--color-accent)' }}>{sectors.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span style={{ color: 'var(--color-text-secondary)' }}>Total máquinas</span>
                <span className="font-bold" style={{ color: 'var(--color-accent)' }}>{machines.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main - Máquinas em Grid */}
        <div className="card flex flex-col min-h-0">
          <div className="card-header" style={{ padding: '0.75rem 1rem' }}>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="icon-box">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <path d="M12 12h.01" />
                    <path d="M17 12h.01" />
                    <path d="M7 12h.01" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    Máquinas — {selectedSector?.name ?? '—'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Clique em um card para editar
                  </div>
                </div>
              </div>
              <button
                onClick={openCreateMachine}
                disabled={!sectorId}
                className="btn btn-accent"
                style={{ padding: '0.5rem 1rem' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                Nova Máquina
              </button>
            </div>
          </div>

          <div className="card-body flex-1 overflow-auto" style={{ padding: '1rem' }}>
            {machinesForSelectedSector.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12" style={{ color: 'var(--color-text-tertiary)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <path d="M12 12h.01" />
                </svg>
                <p className="mt-3 text-sm">Nenhuma máquina neste setor</p>
                <button onClick={openCreateMachine} className="btn btn-secondary mt-4">
                  Criar primeira máquina
                </button>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {machinesForSelectedSector.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => openEditMachine(m)}
                    className="group p-4 rounded-xl cursor-pointer transition-all hover:shadow-md"
                    style={{
                      background: m.is_active ? 'var(--color-surface-0)' : 'var(--color-surface-1)',
                      border: '1px solid var(--color-border-light)',
                      opacity: m.is_active ? 1 : 0.6,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                        style={{
                          background: m.is_active ? 'var(--color-accent)' : 'var(--color-surface-3)',
                          color: m.is_active ? 'white' : 'var(--color-text-tertiary)',
                        }}
                      >
                        {m.code.slice(0, 2)}
                      </div>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          background: m.is_active ? 'var(--color-success-light)' : 'var(--color-surface-2)',
                          color: m.is_active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                        }}
                      >
                        {m.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    <div className="mt-3">
                      <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {m.code}
                      </div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                        {m.name_display}
                      </div>
                    </div>
                    <div className="mt-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      Ordem: {m.sort_order ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Setor */}
      {showSectorModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowSectorModal(false)}
        >
          <div
            className="card w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <div className="flex items-center gap-3">
                <div className="icon-box icon-box-accent">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {editingSector ? 'Editar Setor' : 'Novo Setor'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {editingSector ? 'Altere os dados do setor' : 'Preencha os dados do novo setor'}
                  </div>
                </div>
              </div>
            </div>

            <div className="card-body space-y-4">
              <div>
                <label className="label">Nome</label>
                <input
                  value={formSectorName}
                  onChange={(e) => setFormSectorName(e.target.value)}
                  placeholder="Ex: Usinagem"
                  className="input w-full"
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Ordem de exibição</label>
                <input
                  value={formSectorOrder}
                  onChange={(e) => setFormSectorOrder(e.target.value)}
                  className="input w-full"
                  inputMode="numeric"
                  placeholder="0"
                />
                <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  Menor número aparece primeiro
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                <button
                  onClick={() => setShowSectorModal(false)}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveSector}
                  disabled={busy || !formSectorName.trim()}
                  className="btn btn-accent"
                >
                  {editingSector ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Máquina */}
      {showMachineModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowMachineModal(false)}
        >
          <div
            className="card w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <div className="flex items-center gap-3">
                <div className="icon-box icon-box-accent">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <path d="M12 12h.01" />
                    <path d="M17 12h.01" />
                    <path d="M7 12h.01" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {editingMachine ? 'Editar Máquina' : 'Nova Máquina'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {editingMachine ? 'Altere os dados da máquina' : 'Preencha os dados da nova máquina'}
                  </div>
                </div>
              </div>
            </div>

            <div className="card-body space-y-4">
              <div>
                <label className="label">Setor</label>
                <select
                  value={formMachineSector}
                  onChange={(e) => setFormMachineSector(e.target.value)}
                  className="select w-full"
                >
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Código</label>
                  <input
                    value={formMachineCode}
                    onChange={(e) => setFormMachineCode(e.target.value)}
                    placeholder="Ex: TCN-12"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label">Ordem</label>
                  <input
                    value={formMachineOrder}
                    onChange={(e) => setFormMachineOrder(e.target.value)}
                    className="input w-full"
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="label">Nome de exibição</label>
                <input
                  value={formMachineDisplay}
                  onChange={(e) => setFormMachineDisplay(e.target.value)}
                  placeholder="Ex: Torno CNC 12"
                  className="input w-full"
                />
              </div>

              {editingMachine && (
                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--color-surface-1)' }}>
                  <div>
                    <div className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      Status
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      Máquinas inativas não aparecem em Resultados
                    </div>
                  </div>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formMachineActive}
                      onChange={(e) => setFormMachineActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className="relative w-11 h-6 rounded-full transition-colors peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                      style={{
                        background: formMachineActive ? 'var(--color-success)' : 'var(--color-surface-3)',
                      }}
                    />
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                <button
                  onClick={() => setShowMachineModal(false)}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveMachine}
                  disabled={busy || !formMachineCode.trim() || !formMachineDisplay.trim()}
                  className="btn btn-accent"
                >
                  {editingMachine ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
