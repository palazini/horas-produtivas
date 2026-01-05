import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
    deleteTargetDaily,
    upsertAllTargetsZero,
    fetchMachinesLite,
    fetchTargetsDaily,
    fetchTargetsDefaults,
    upsertTargetDaily,
    upsertTargetDefault,
    copyTargetsDefaults,
    type MachineLite,
    type TargetDailyRow,
} from '../features/targets/targetsService'
import { cn } from '../lib/cn'

function isBusinessDay(d: dayjs.Dayjs) {
    const wd = d.day() // 0 dom ... 6 sáb
    return wd >= 1 && wd <= 5
}

function round2(n: number) {
    return Math.round(n * 100) / 100
}

function hoursLabel(n: number) {
    const v = Number.isFinite(n) ? n : 0
    return v.toFixed(2)
}

// Monday-first offset: Mon=0 ... Sun=6
function monFirstOffset(d: dayjs.Dayjs) {
    return (d.day() + 6) % 7
}

type DayCell = {
    day: string // YYYY-MM-DD
    inMonth: boolean
}

export function TargetsPage() {
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    // mês selecionado
    const [ym, setYm] = useState(() => dayjs().format('YYYY-MM'))
    const monthStart = useMemo(() => dayjs(`${ym}-01`).startOf('month'), [ym])
    const monthEnd = useMemo(() => monthStart.endOf('month'), [monthStart])
    const dateFrom = useMemo(() => monthStart.format('YYYY-MM-DD'), [monthStart])
    const dateTo = useMemo(() => monthEnd.format('YYYY-MM-DD'), [monthEnd])

    // dados
    const [machines, setMachines] = useState<MachineLite[]>([])
    const [selectedSectorId, setSelectedSectorId] = useState<string>('all')
    const [selectedMachineId, setSelectedMachineId] = useState<string>('')

    // metas
    const [defaultDailyByMachine, setDefaultDailyByMachine] = useState<Record<string, number>>({})
    const [dailyByMachine, setDailyByMachine] = useState<Record<string, Record<string, number>>>({})

    // modal edição do dia
    const [editDay, setEditDay] = useState<string | null>(null)
    const [editHours, setEditHours] = useState<string>('')

    // modal importar metas
    const [showImportModal, setShowImportModal] = useState(false)
    const [importSourceMonth, setImportSourceMonth] = useState<string>('')
    const [showConfirmImport, setShowConfirmImport] = useState(false)

    // load máquinas (uma vez)
    useEffect(() => {
        ; (async () => {
            setBusy(true)
            setErr(null)
            try {
                const ms = await fetchMachinesLite()
                const active = (ms ?? []).filter((m) => m.is_active)
                setMachines(active)
                setSelectedMachineId((prev) => prev || active[0]?.id || '')
            } catch (e: any) {
                setErr(e?.message ?? 'Falha ao carregar máquinas.')
            } finally {
                setBusy(false)
            }
        })()
    }, [])

    // load metas do mês
    useEffect(() => {
        ; (async () => {
            setBusy(true)
            setErr(null)
            try {
                const [defs, td] = await Promise.all([
                    fetchTargetsDefaults(`${ym}-01`),
                    fetchTargetsDaily(dateFrom, dateTo),
                ])

                const dMap: Record<string, number> = {}
                for (const r of defs) dMap[r.machine_id] = Number(r.daily_target ?? 0)
                setDefaultDailyByMachine(dMap)

                const ov: Record<string, Record<string, number>> = {}
                for (const r of td) {
                    ov[r.machine_id] ||= {}
                    ov[r.machine_id][r.day] = Number(r.target_hours ?? 0)
                }
                setDailyByMachine(ov)
            } catch (e: any) {
                setErr(e?.message ?? 'Falha ao carregar metas do mês.')
            } finally {
                setBusy(false)
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ym, dateFrom, dateTo])

    const sectors = useMemo(() => {
        const map = new Map<string, { id: string; name: string }>()
        for (const m of machines) {
            if (m.sector?.id) map.set(m.sector.id, { id: m.sector.id, name: m.sector.name })
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
    }, [machines])

    const machinesFiltered = useMemo(() => {
        const base = machines.slice().sort((a, b) => {
            const sa = a.sector?.name ?? ''
            const sb = b.sector?.name ?? ''
            const c1 = sa.localeCompare(sb)
            if (c1 !== 0) return c1
            return (a.code ?? '').localeCompare(b.code ?? '')
        })
        if (selectedSectorId === 'all') return base
        return base.filter((m) => m.sector_id === selectedSectorId)
    }, [machines, selectedSectorId])

    useEffect(() => {
        if (!selectedMachineId) {
            setSelectedMachineId(machinesFiltered[0]?.id || '')
            return
        }
        const ok = machinesFiltered.some((m) => m.id === selectedMachineId)
        if (!ok) setSelectedMachineId(machinesFiltered[0]?.id || '')
    }, [machinesFiltered, selectedMachineId])

    const selectedMachine = useMemo(
        () => machines.find((m) => m.id === selectedMachineId) ?? null,
        [machines, selectedMachineId]
    )

    const defaultDaily = useMemo(
        () => Number(defaultDailyByMachine[selectedMachineId] ?? 0),
        [defaultDailyByMachine, selectedMachineId]
    )

    const overrides = useMemo(
        () => dailyByMachine[selectedMachineId] ?? {},
        [dailyByMachine, selectedMachineId]
    )

    // calendário (seg–dom)
    const calendarCells = useMemo(() => {
        const start = monthStart.startOf('month')
        const end = monthEnd.endOf('month')
        const offset = monFirstOffset(start)
        const cells: DayCell[] = []

        for (let i = 0; i < offset; i++) cells.push({ day: '', inMonth: false })

        let d = start
        while (d.isBefore(end) || d.isSame(end, 'day')) {
            cells.push({ day: d.format('YYYY-MM-DD'), inMonth: true })
            d = d.add(1, 'day')
        }

        while (cells.length % 7 !== 0) cells.push({ day: '', inMonth: false })

        return cells
    }, [monthStart, monthEnd])

    function effectiveTargetForDay(day: string) {
        const ov = overrides?.[day]
        if (ov != null) return Number(ov ?? 0)
        if (isBusinessDay(dayjs(day))) return Number(defaultDaily ?? 0)
        return 0
    }

    const monthlyTotal = useMemo(() => {
        if (!selectedMachineId) return 0
        let total = 0
        let d = monthStart
        const end = monthEnd
        while (d.isBefore(end) || d.isSame(end, 'day')) {
            total += effectiveTargetForDay(d.format('YYYY-MM-DD'))
            d = d.add(1, 'day')
        }
        return round2(total)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMachineId, overrides, defaultDaily, monthStart, monthEnd])

    const breakdown = useMemo(() => {
        let bizCount = 0
        let base = 0
        let overrideBizCount = 0
        let overrideBizSum = 0
        let overrideWkndSum = 0
        let overrideCount = 0

        let d = monthStart
        const end = monthEnd
        while (d.isBefore(end) || d.isSame(end, 'day')) {
            const day = d.format('YYYY-MM-DD')
            const biz = isBusinessDay(d)
            if (biz) {
                bizCount += 1
                base += Number(defaultDaily ?? 0)
            }
            const ov = overrides?.[day]
            if (ov != null) {
                overrideCount += 1
                if (biz) {
                    overrideBizCount += 1
                    overrideBizSum += Number(ov ?? 0)
                } else {
                    overrideWkndSum += Number(ov ?? 0)
                }
            }
            d = d.add(1, 'day')
        }

        return {
            bizCount,
            base: round2(base),
            overrideCount,
            overrideBizCount,
            overrideBizSum: round2(overrideBizSum),
            overrideWkndSum: round2(overrideWkndSum),
            monthly: monthlyTotal,
        }
    }, [monthStart, monthEnd, overrides, defaultDaily, monthlyTotal])

    async function saveDefaultDaily() {
        if (!selectedMachineId) return
        setBusy(true)
        setErr(null)
        try {
            await upsertTargetDefault({
                machine_id: selectedMachineId,
                month: `${ym}-01`,
                daily_target: Number(defaultDaily ?? 0),
            })
        } catch (e: any) {
            setErr(e?.message ?? 'Falha ao salvar meta diária padrão.')
        } finally {
            setBusy(false)
        }
    }

    async function applyOverride(day: string, hours: number) {
        if (!selectedMachineId) return
        setBusy(true)
        setErr(null)
        try {
            const row: TargetDailyRow = { machine_id: selectedMachineId, day, target_hours: hours }
            await upsertTargetDaily(row)

            setDailyByMachine((prev) => {
                const copy = { ...prev }
                const mm = { ...(copy[selectedMachineId] ?? {}) }
                mm[day] = hours
                copy[selectedMachineId] = mm
                return copy
            })
            setEditDay(null)
            setEditHours('')
        } catch (e: any) {
            setErr(e?.message ?? 'Falha ao aplicar override.')
        } finally {
            setBusy(false)
        }
    }

    async function removeOverride(day: string) {
        if (!selectedMachineId) return
        setBusy(true)
        setErr(null)
        try {
            await deleteTargetDaily(selectedMachineId, day)
            setDailyByMachine((prev) => {
                const copy = { ...prev }
                const mm = { ...(copy[selectedMachineId] ?? {}) }
                delete mm[day]
                copy[selectedMachineId] = mm
                return copy
            })
            setEditDay(null)
            setEditHours('')
        } catch (e: any) {
            setErr(e?.message ?? 'Falha ao remover override.')
        } finally {
            setBusy(false)
        }
    }
    async function setAllMachinesZeroForDay(day: string) {
        setBusy(true)
        setErr(null)
        try {
            // Pega IDs de todas as máquinas ativas
            const allMachineIds = machines.map((m) => m.id)
            await upsertAllTargetsZero(day, allMachineIds)
            // Atualiza estado local: define target_hours=0 para todas as máquinas nesse dia
            setDailyByMachine((prev) => {
                const copy = { ...prev }
                for (const machineId of allMachineIds) {
                    copy[machineId] = { ...(copy[machineId] ?? {}), [day]: 0 }
                }
                return copy
            })
            setEditDay(null)
            setEditHours('')
        } catch (e: any) {
            setErr(e?.message ?? 'Falha ao zerar metas do dia.')
        } finally {
            setBusy(false)
        }
    }

    // Verifica se o mês atual já tem metas
    const currentMonthHasTargets = useMemo(() => {
        return Object.keys(defaultDailyByMachine).length > 0
    }, [defaultDailyByMachine])

    // Handler para iniciar importação
    function handleStartImport() {
        // Define mês anterior como padrão
        const prevMonth = dayjs(`${ym}-01`).subtract(1, 'month').format('YYYY-MM')
        setImportSourceMonth(prevMonth)
        setShowImportModal(true)
    }

    // Handler para confirmar importação
    async function handleConfirmImport() {
        if (!importSourceMonth) return
        setShowImportModal(false)
        setShowConfirmImport(false)
        setBusy(true)
        setErr(null)
        try {
            const count = await copyTargetsDefaults(`${importSourceMonth}-01`, `${ym}-01`)
            if (count === 0) {
                setErr('Nenhuma meta encontrada no mês de origem.')
            } else {
                // Recarrega as metas do mês atual
                const defs = await fetchTargetsDefaults(`${ym}-01`)
                const dMap: Record<string, number> = {}
                for (const r of defs) dMap[r.machine_id] = Number(r.daily_target ?? 0)
                setDefaultDailyByMachine(dMap)
            }
        } catch (e: any) {
            setErr(e?.message ?? 'Falha ao importar metas.')
        } finally {
            setBusy(false)
        }
    }

    // Handler para prosseguir (verifica se precisa confirmação)
    function handleProceedImport() {
        if (currentMonthHasTargets) {
            setShowImportModal(false)
            setShowConfirmImport(true)
        } else {
            handleConfirmImport()
        }
    }

    const today = dayjs().format('YYYY-MM-DD')
    const weekLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

    return (
        <div className="flex flex-col h-full" style={{ gap: '0.75rem' }}>
            {/* Page Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="page-title section-header">Metas</h1>
                    <p className="page-subtitle mt-2">
                        Defina a <strong>meta diária padrão</strong> (seg–sex) e crie <strong>overrides</strong> para dias específicos.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Loading badge - à esquerda */}
                    {busy && (
                        <span className="badge badge-neutral">
                            <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            Carregando…
                        </span>
                    )}

                    {/* Custom Month Picker */}
                    <div
                        className="flex items-center gap-1 px-1 py-1 rounded-xl"
                        style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border-light)' }}
                    >
                        <button
                            type="button"
                            onClick={() => setYm(dayjs(`${ym}-01`).subtract(1, 'month').format('YYYY-MM'))}
                            className="p-2 rounded-lg hover:bg-white"
                            style={{ color: 'var(--color-text-secondary)', transition: 'background 150ms' }}
                            title="Mês anterior"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m15 18-6-6 6-6" />
                            </svg>
                        </button>

                        <div
                            className="px-4 py-2 min-w-[160px] text-center rounded-lg select-none"
                            style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}
                        >
                            <span style={{ textTransform: 'capitalize' }}>
                                {monthStart.format('MMMM')}
                            </span>
                            <span className="ml-2" style={{ color: 'var(--color-accent)', fontWeight: 700 }}>
                                {monthStart.format('YYYY')}
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={() => setYm(dayjs(`${ym}-01`).add(1, 'month').format('YYYY-MM'))}
                            className="p-2 rounded-lg hover:bg-white"
                            style={{ color: 'var(--color-text-secondary)', transition: 'background 150ms' }}
                            title="Próximo mês"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                        </button>
                    </div>

                    {/* Botão Importar */}
                    <button
                        type="button"
                        onClick={handleStartImport}
                        className="btn btn-secondary"
                        title="Importar metas de outro mês"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" x2="12" y1="15" y2="3" />
                        </svg>
                        Importar
                    </button>
                </div>
            </div>

            {err && (
                <div className="alert alert-error">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" x2="12" y1="8" y2="12" />
                        <line x1="12" x2="12.01" y1="16" y2="16" />
                    </svg>
                    <span>{err}</span>
                </div>
            )}

            {/* KPIs */}
            <div className="card">
                <div className="card-header">
                    <div className="flex items-center gap-3">
                        <div className="icon-box icon-box-accent">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                            </svg>
                        </div>
                        <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                            Resumo do Mês — {monthStart.format('MMMM YYYY')}
                        </span>
                    </div>
                </div>
                <div className="card-body" style={{ padding: '0.5rem 1rem' }}>
                    <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
                        <div className="metric-card" style={{ padding: '0.5rem 0.75rem', background: 'var(--color-accent-light)', borderColor: 'var(--color-accent-muted)' }}>
                            <div className="metric-label">Meta Mensal</div>
                            <div className="metric-value" style={{ color: 'var(--color-accent)' }}>{hoursLabel(monthlyTotal)} h</div>
                        </div>
                        <div className="metric-card" style={{ padding: '0.5rem 0.75rem' }}>
                            <div className="metric-label">Dias úteis</div>
                            <div className="metric-value">{breakdown.bizCount}</div>
                        </div>
                        <div className="metric-card" style={{ padding: '0.5rem 0.75rem' }}>
                            <div className="metric-label">Base (úteis)</div>
                            <div className="metric-value-sm">{hoursLabel(breakdown.base)} h</div>
                        </div>
                        <div className="metric-card" style={{ padding: '0.5rem 0.75rem' }}>
                            <div className="metric-label">Overrides</div>
                            <div className="metric-value">{breakdown.overrideCount}</div>
                        </div>
                        <div className="metric-card" style={{ padding: '0.5rem 0.75rem' }}>
                            <div className="metric-label">OV fds</div>
                            <div className="metric-value-sm">{hoursLabel(breakdown.overrideWkndSum)} h</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid gap-4 lg:grid-cols-[320px_1fr] flex-1 min-h-0">
                {/* Sidebar */}
                <div className="flex flex-col gap-3">
                    {/* Setor / Máquina selector */}
                    <div className="card">
                        <div className="card-header" style={{ padding: '0.5rem 0.75rem' }}>
                            <div className="flex items-center gap-2">
                                <div className="icon-box" style={{ width: '1.75rem', height: '1.75rem' }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="6" width="20" height="12" rx="2" />
                                        <path d="M12 12h.01" />
                                        <path d="M17 12h.01" />
                                        <path d="M7 12h.01" />
                                    </svg>
                                </div>
                                <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                    Máquina
                                </span>
                            </div>
                        </div>
                        <div className="card-body space-y-2" style={{ padding: '0.5rem 0.75rem' }}>
                            <div>
                                <label className="label">Setor</label>
                                <select
                                    value={selectedSectorId}
                                    onChange={(e) => setSelectedSectorId(e.target.value)}
                                    className="select w-full"
                                >
                                    <option value="all">Todos os setores</option>
                                    {sectors.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="label">Máquina</label>
                                <select
                                    value={selectedMachineId}
                                    onChange={(e) => setSelectedMachineId(e.target.value)}
                                    className="select w-full"
                                >
                                    {machinesFiltered.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {(m.sector?.name ?? '—') + ' — ' + m.code}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedMachine && (
                                <div className="p-2 rounded-lg flex items-center gap-2" style={{ background: 'var(--color-surface-1)' }}>
                                    <div
                                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                                        style={{ background: 'var(--color-accent)', color: 'white' }}
                                    >
                                        {selectedMachine.code.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                            {selectedMachine.code}
                                        </div>
                                        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                            {selectedMachine.name_display} • {selectedMachine.sector?.name ?? '—'}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Default diário */}
                    <div className="card">
                        <div className="card-header">
                            <div className="flex items-center gap-3">
                                <div className="icon-box">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                        Meta Diária (padrão)
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                        Aplicado seg–sex quando não existe override
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="card-body">
                            <div className="flex items-center gap-2">
                                <input
                                    value={String(defaultDaily ?? 0)}
                                    onChange={(e) => {
                                        if (!selectedMachineId) return
                                        const v = Number(String(e.target.value).replace(',', '.'))
                                        setDefaultDailyByMachine((p) => ({
                                            ...p,
                                            [selectedMachineId]: Number.isFinite(v) ? v : 0,
                                        }))
                                    }}
                                    className="input w-full"
                                    placeholder="Horas/dia"
                                    inputMode="decimal"
                                    disabled={!selectedMachineId}
                                />
                                <button
                                    onClick={saveDefaultDaily}
                                    disabled={busy || !selectedMachineId}
                                    className="btn btn-accent"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                    Salvar
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Legenda */}
                    <div className="card flex-1 flex flex-col justify-end">
                        <div className="card-body" style={{ padding: '0.75rem 1rem' }}>
                            <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                <LegendDot bg="var(--color-accent)" label="Override" />
                                <LegendDot bg="var(--color-surface-2)" label="Padrão" />
                                <LegendDot bg="var(--color-warning-light)" label="Fim de semana" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Calendar */}
                <div className="card">
                    <div className="card-header" style={{ padding: '0.625rem 1rem' }}>
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-3">
                                <div className="icon-box">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                                        <line x1="16" x2="16" y1="2" y2="6" />
                                        <line x1="8" x2="8" y1="2" y2="6" />
                                        <line x1="3" x2="21" y1="10" y2="10" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                        Calendário — {monthStart.format('MMMM YYYY')}
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                        Clique em um dia para editar
                                    </div>
                                </div>
                            </div>

                            <span className="badge badge-info">{selectedMachine?.code ?? '—'}</span>
                        </div>
                    </div>

                    <div className="card-body" style={{ padding: '0.5rem 0.75rem' }}>
                        <div className="grid grid-cols-7 gap-1.5">
                            {/* Week labels */}
                            {weekLabels.map((w, i) => (
                                <div
                                    key={w}
                                    className="p-2 text-center font-semibold text-xs"
                                    style={{ color: i >= 5 ? 'var(--color-warning)' : 'var(--color-text-tertiary)' }}
                                >
                                    {w}
                                </div>
                            ))}

                            {/* Calendar days */}
                            {calendarCells.map((c, idx) => {
                                if (!c.inMonth) {
                                    return <div key={`blank-${idx}`} style={{ minHeight: '48px' }} />
                                }

                                const d = dayjs(c.day)
                                const isBiz = isBusinessDay(d)
                                const ov = overrides?.[c.day]
                                const hasOverride = ov != null
                                const eff = effectiveTargetForDay(c.day)
                                const isToday = c.day === today
                                const isSelected = editDay === c.day

                                return (
                                    <button
                                        key={c.day}
                                        type="button"
                                        disabled={!selectedMachineId}
                                        onClick={() => {
                                            setEditDay(c.day)
                                            setEditHours(hasOverride ? String(ov) : '')
                                        }}
                                        className={cn(
                                            'relative p-1.5 rounded-lg text-left transition-all disabled:opacity-40',
                                            isSelected && 'ring-2',
                                            isToday && 'ring-2'
                                        )}
                                        style={{
                                            minHeight: '48px',
                                            background: hasOverride
                                                ? 'var(--color-accent-light)'
                                                : !isBiz
                                                    ? 'var(--color-warning-light)'
                                                    : 'var(--color-surface-1)',
                                            border: hasOverride
                                                ? '2px solid var(--color-accent)'
                                                : '1px solid var(--color-border-light)',
                                            boxShadow: isToday ? '0 0 0 2px var(--color-accent-muted)' : isSelected ? '0 0 0 2px var(--color-accent)' : undefined,
                                        }}
                                    >
                                        <div className="flex items-start justify-between gap-1">
                                            <div
                                                className="font-semibold text-sm tabular-nums"
                                                style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-text-primary)' }}
                                            >
                                                {d.format('DD')}
                                            </div>

                                            {hasOverride && (
                                                <div
                                                    className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                                                    style={{ background: 'var(--color-accent)', color: 'white' }}
                                                >
                                                    OV
                                                </div>
                                            )}
                                        </div>

                                        <div
                                            className="mt-1 font-bold text-lg tabular-nums"
                                            style={{ color: eff > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
                                        >
                                            {hoursLabel(eff)}
                                        </div>
                                        <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                                            {hasOverride ? 'override' : isBiz ? 'padrão' : '—'}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal editar dia */}
            {editDay && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.4)' }}
                    onClick={() => {
                        setEditDay(null)
                        setEditHours('')
                    }}
                >
                    <div
                        className="card w-full max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="card-header">
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-3">
                                    <div className="icon-box">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                            Editar dia — {dayjs(editDay).format('DD/MM/YYYY')}
                                        </div>
                                        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                            {isBusinessDay(dayjs(editDay)) ? 'Dia útil' : 'Fim de semana'}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        setEditDay(null)
                                        setEditHours('')
                                    }}
                                    className="btn btn-ghost"
                                    style={{ padding: '0.5rem' }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 6 6 18" />
                                        <path d="m6 6 12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="card-body space-y-4">
                            <div>
                                <label className="label">Horas (override)</label>
                                <input
                                    value={editHours}
                                    onChange={(e) => setEditHours(e.target.value)}
                                    placeholder="ex: 7,50"
                                    className="input w-full"
                                    inputMode="decimal"
                                    autoFocus
                                />
                                <div className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                    Deixe em branco e clique <strong>Remover</strong> para voltar ao padrão.
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                                <button
                                    disabled={busy}
                                    onClick={() => setAllMachinesZeroForDay(editDay)}
                                    className="btn"
                                    style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)', border: '1px solid var(--color-warning)' }}
                                    title="Define meta = 0h para TODAS as máquinas neste dia"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 6h18" />
                                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                        <line x1="10" x2="10" y1="11" y2="17" />
                                        <line x1="14" x2="14" y1="11" y2="17" />
                                    </svg>
                                    Zerar Todas
                                </button>

                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={busy}
                                        onClick={() => removeOverride(editDay)}
                                        className="btn btn-secondary"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18" />
                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                        </svg>
                                        Remover
                                    </button>

                                    <button
                                        disabled={busy}
                                        onClick={() => {
                                            const h = Number(String(editHours).replace(',', '.'))
                                            if (!Number.isFinite(h) || h < 0) {
                                                setErr('Horas inválidas para override.')
                                                return
                                            }
                                            applyOverride(editDay, h)
                                        }}
                                        className="btn btn-accent"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M20 6 9 17l-5-5" />
                                        </svg>
                                        Aplicar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Importar Metas */}
            {showImportModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.4)' }}
                    onClick={() => setShowImportModal(false)}
                >
                    <div
                        className="card w-full max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="card-header">
                            <div className="flex items-center gap-3">
                                <div className="icon-box icon-box-accent">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" x2="12" y1="15" y2="3" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                        Importar Metas
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                        Copiar metas diárias padrão de outro mês
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card-body space-y-4">
                            <div>
                                <label className="label">Mês de origem</label>
                                <div
                                    className="flex items-center gap-1 px-1 py-1 rounded-xl"
                                    style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border-light)' }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setImportSourceMonth(dayjs(`${importSourceMonth}-01`).subtract(1, 'month').format('YYYY-MM'))}
                                        className="p-2 rounded-lg hover:bg-white"
                                        style={{ color: 'var(--color-text-secondary)', transition: 'background 150ms' }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m15 18-6-6 6-6" />
                                        </svg>
                                    </button>
                                    <div
                                        className="flex-1 px-3 py-2 text-center select-none"
                                        style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}
                                    >
                                        <span style={{ textTransform: 'capitalize' }}>
                                            {dayjs(`${importSourceMonth}-01`).format('MMMM')}
                                        </span>
                                        <span className="ml-2" style={{ color: 'var(--color-accent)', fontWeight: 700 }}>
                                            {dayjs(`${importSourceMonth}-01`).format('YYYY')}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setImportSourceMonth(dayjs(`${importSourceMonth}-01`).add(1, 'month').format('YYYY-MM'))}
                                        className="p-2 rounded-lg hover:bg-white"
                                        style={{ color: 'var(--color-text-secondary)', transition: 'background 150ms' }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m9 18 6-6-6-6" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div
                                className="p-3 rounded-lg text-sm"
                                style={{ background: 'var(--color-info-light)', color: 'var(--color-info)' }}
                            >
                                <strong>Destino:</strong>{' '}
                                <span style={{ textTransform: 'capitalize' }}>{monthStart.format('MMMM YYYY')}</span>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                                <button
                                    onClick={() => setShowImportModal(false)}
                                    className="btn btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleProceedImport}
                                    disabled={importSourceMonth === ym}
                                    className="btn btn-accent"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" x2="12" y1="15" y2="3" />
                                    </svg>
                                    Importar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Confirmação */}
            {showConfirmImport && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.4)' }}
                    onClick={() => setShowConfirmImport(false)}
                >
                    <div
                        className="card w-full max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="card-header">
                            <div className="flex items-center gap-3">
                                <div className="icon-box" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                                        <path d="M12 9v4" />
                                        <path d="M12 17h.01" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                        Confirmar Importação
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                        O mês atual já possui metas
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card-body space-y-4">
                            <div
                                className="p-3 rounded-lg text-sm"
                                style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}
                            >
                                As metas existentes em <strong style={{ textTransform: 'capitalize' }}>{monthStart.format('MMMM YYYY')}</strong> serão <strong>sobrescritas</strong> pelas metas de{' '}
                                <strong style={{ textTransform: 'capitalize' }}>{dayjs(`${importSourceMonth}-01`).format('MMMM YYYY')}</strong>.
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                                <button
                                    onClick={() => setShowConfirmImport(false)}
                                    className="btn btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmImport}
                                    className="btn"
                                    style={{ background: 'var(--color-warning)', color: 'white' }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                    Confirmar e Sobrescrever
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function LegendDot(props: { bg: string; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <span
                className="w-3 h-3 rounded"
                style={{ background: props.bg }}
            />
            <span>{props.label}</span>
        </div>
    )
}