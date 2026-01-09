import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { toPng } from 'html-to-image'
import {
    fetchLatestReadyBatch,
    fetchMachinesAll,
    fetchAllReadyBatchesForMonth,
    fetchDailyHoursForMonth,
    fetchTargetsDaily,
    fetchTargetsDefaults,
    fetchRawRowsForMachine,
    type DailyHourRow,
    type MachineRow,
    type TargetDefault,
    type RawProductionRow,
} from '../features/results/resultsService'

type ViewType = 'producao' | 'contabilidade'

function isBusinessDay(d: dayjs.Dayjs) {
    const wd = d.day()
    return wd >= 1 && wd <= 5
}

function isSaturday(d: dayjs.Dayjs) {
    return d.day() === 6
}

function ymd(d: dayjs.Dayjs) {
    return d.format('YYYY-MM-DD')
}

function isSameOrBeforeDay(a: dayjs.Dayjs, b: dayjs.Dayjs) {
    return a.isBefore(b, 'day') || a.isSame(b, 'day')
}

function fmtDayBR(iso: string) {
    return dayjs(iso).format('DD/MM')
}

function fmtMonthBR(monthStartIso: string) {
    return dayjs(monthStartIso).format('MMMM YYYY')
}

function round2(n: number) {
    return Math.round(n * 100) / 100
}

function pct(n: number, d: number) {
    if (!d || d <= 0) return null
    return n / d
}

function pctLabel(p: number | null) {
    if (p == null) return '—'
    return `${Math.round(p * 100)}%`
}

function hoursLabel(n: number) {
    const v = Number.isFinite(n) ? n : 0
    return v.toFixed(2)
}

// Retorna a sexta-feira anterior a uma data (ou a própria data se for sexta)
function getPreviousFriday(d: dayjs.Dayjs): dayjs.Dayjs {
    const wd = d.day()
    if (wd === 5) return d // já é sexta
    if (wd === 6) return d.subtract(1, 'day') // sábado -> sexta
    // Para outros dias (seg-qui, dom), vai para a sexta anterior
    const diff = (wd + 2) % 7
    return d.subtract(diff, 'day')
}

type MachineMetrics = {
    machine: MachineRow
    monthTarget: number
    dayTarget: number
    dayReal: number
    dayDelta: number
    accTarget: number
    accReal: number
    accDelta: number
    pctDay: number | null
    pctMonth: number | null
}

type GroupMetrics = Omit<MachineMetrics, 'machine'> & {
    key: string
    label: string
    sector?: MachineRow['sector']
    children?: MachineMetrics[]
}

export function ResultsPage() {
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const [batchIds, setBatchIds] = useState<string[]>([])
    const [refDate, setRefDate] = useState<string | null>(null)
    const [monthStart, setMonthStart] = useState<string | null>(null)

    // Month navigation state - null means "latest month"
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

    const [machines, setMachines] = useState<MachineRow[]>([])
    const [dailyRows, setDailyRows] = useState<DailyHourRow[]>([])
    const [targetsDefaults, setTargetsDefaults] = useState<TargetDefault[]>([])
    const [targetsDaily, setTargetsDaily] = useState<Record<string, Record<string, number>>>({})

    const resumoRef = useRef<HTMLTableElement | null>(null)
    const detalheRef = useRef<HTMLDivElement | null>(null)

    const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({})

    // NOVO: Switcher Produção / Contabilidade
    const [viewType, setViewType] = useState<ViewType>('producao')

    // Selected day for detail view (null means use refDate)
    const [selectedDay, setSelectedDay] = useState<string | null>(null)

    // Selected machine for modal drill-down
    const [selectedMachine, setSelectedMachine] = useState<MachineRow | null>(null)
    const [hiddenDays, setHiddenDays] = useState<string[]>([])

    async function load(targetMonth?: string | null) {
        setBusy(true)
        setErr(null)
        try {
            // Determinar o mês a ser buscado
            let yearMonth: string
            let latestRefDate: string | null = null

            if (targetMonth) {
                yearMonth = targetMonth
            } else {
                // Buscar o batch mais recente para descobrir o mês
                const latestBatch = await fetchLatestReadyBatch()
                if (!latestBatch || !latestBatch.year_month) {
                    setBatchIds([])
                    setRefDate(null)
                    setMonthStart(null)
                    setMachines([])
                    setDailyRows([])
                    setHiddenDays([])
                    setTargetsDefaults([])
                    setTargetsDaily({})
                    return
                }
                yearMonth = latestBatch.year_month
                latestRefDate = latestBatch.ref_date
            }

            // Buscar TODOS os batches ready do mês
            const batches = await fetchAllReadyBatchesForMonth(yearMonth)

            if (!batches.length) {
                setBatchIds([])
                setRefDate(null)
                setMonthStart(null)
                setMachines([])
                setDailyRows([])
                setHiddenDays([])
                setTargetsDefaults([])
                setTargetsDaily({})
                if (targetMonth) {
                    setErr(`Nenhum batch encontrado para ${dayjs(targetMonth).format('MMMM YYYY')}.`)
                }
                return
            }

            // Usar a maior ref_date entre todos os batches
            const allRefDates = batches.map(b => b.ref_date).filter(Boolean) as string[]
            const maxRefDate = allRefDates.sort().pop() ?? latestRefDate

            if (!maxRefDate) throw new Error('Batch pronto sem ref_date.')

            const ms = dayjs(yearMonth).startOf('month')
            const me = dayjs(yearMonth).endOf('month')

            setBatchIds(batches.map(b => b.id))
            setRefDate(maxRefDate)
            setMonthStart(ymd(ms))
            setSelectedDay(null) // Reset day selection when loading new month
            setHiddenDays([])

            // Buscar dados consolidados de TODOS os batches do mês
            const [allMachines, monthDaily, tDef, td] = await Promise.all([
                fetchMachinesAll(),
                fetchDailyHoursForMonth(yearMonth, ymd(ms), ymd(me)),
                fetchTargetsDefaults(ymd(ms)),
                fetchTargetsDaily(ymd(ms), ymd(me)),
            ])

            setMachines(allMachines)
            setDailyRows(monthDaily)
            setTargetsDefaults(tDef)

            const tdMap: Record<string, Record<string, number>> = {}
            for (const r of td) {
                tdMap[r.machine_id] ||= {}
                tdMap[r.machine_id][r.day] = Number(r.target_hours ?? 0)
            }
            setTargetsDaily(tdMap)
        } catch (e: any) {
            setErr(e?.message ?? 'Falha ao carregar resultados.')
        } finally {
            setBusy(false)
        }
    }

    useEffect(() => { load(selectedMonth) }, [selectedMonth])

    function goToPreviousMonth() {
        if (!monthStart) return
        const prevMonth = dayjs(monthStart).subtract(1, 'month').startOf('month')
        setSelectedMonth(ymd(prevMonth))
    }

    function goToNextMonth() {
        if (!monthStart) return
        const nextMonth = dayjs(monthStart).add(1, 'month').startOf('month')
        // Don't allow navigating beyond current month
        if (nextMonth.isAfter(dayjs(), 'month')) return
        setSelectedMonth(ymd(nextMonth))
    }

    function goToLatestMonth() {
        setSelectedMonth(null)
    }

    const month = useMemo(() => {
        if (!monthStart) return null
        const ms = dayjs(monthStart)
        return { start: ms, end: ms.endOf('month') }
    }, [monthStart])

    const dayList = useMemo(() => {
        if (!month) return []
        const out: string[] = []
        let d = month.start
        while (d.isBefore(month.end) || d.isSame(month.end, 'day')) {
            out.push(ymd(d))
            d = d.add(1, 'day')
        }
        return out
    }, [month])

    const realByMachineDay = useMemo(() => {
        const map: Record<string, Record<string, number>> = {}
        for (const r of dailyRows) {
            const mid = r.machine.id
            map[mid] ||= {}
            map[mid][r.prod_day] = (map[mid][r.prod_day] ?? 0) + Number(r.hours ?? 0)
        }
        return map
    }, [dailyRows])

    const defaultsMap = useMemo(() => {
        const map: Record<string, number> = {}
        for (const r of targetsDefaults) map[r.machine_id] = Number(r.daily_target ?? 0)
        return map
    }, [targetsDefaults])

    const effectiveTargetByMachineDay = useMemo(() => {
        if (!monthStart) return {}
        const map: Record<string, Record<string, number>> = {}
        for (const m of machines) {
            const mid = m.id
            const defaultDaily = defaultsMap[mid] ?? 0
            const overrides = targetsDaily[mid] ?? {}
            const perDay: Record<string, number> = {}
            for (const d of dayList) {
                if (overrides[d] !== undefined) perDay[d] = Number(overrides[d])
                else if (isBusinessDay(dayjs(d))) perDay[d] = defaultDaily
                else perDay[d] = 0
            }
            map[mid] = perDay
        }
        return map
    }, [machines, defaultsMap, targetsDaily, dayList, monthStart])

    // Verifica se um dia tem produção
    const dayHasProduction = useMemo(() => {
        const set = new Set<string>()
        for (const r of dailyRows) {
            if (Number(r.hours ?? 0) > 0) set.add(r.prod_day)
        }
        return set
    }, [dailyRows])

    // Data de referência efetiva (para contabilidade, sábado vira sexta)
    const effectiveRefDate = useMemo(() => {
        if (!refDate) return null
        const refD = dayjs(refDate)
        if (viewType === 'contabilidade' && isSaturday(refD)) {
            return ymd(getPreviousFriday(refD))
        }
        return refDate
    }, [refDate, viewType])

    // Dados diários consolidados
    const dailyTrack = useMemo(() => {
        if (!refDate) return []
        const refD = dayjs(refDate)

        if (viewType === 'producao') {
            // MODO PRODUÇÃO: mostra sábados e domingos com produção
            const relevantDays = dayList.filter(d => {
                if (!isSameOrBeforeDay(dayjs(d), refD)) return false
                const wd = dayjs(d).day()
                if (wd >= 1 && wd <= 5) return true // dias úteis sempre
                if (wd === 6) return dayHasProduction.has(d) // sábado só com produção
                if (wd === 0) return dayHasProduction.has(d) // domingo só com produção
                return false
            })

            return relevantDays.map(d => {
                let meta = 0, real = 0
                for (const m of machines) {
                    meta += Number(effectiveTargetByMachineDay[m.id]?.[d] ?? 0)
                    real += Number(realByMachineDay[m.id]?.[d] ?? 0)
                }
                const wd = dayjs(d).day()
                const isSat = wd === 6
                const isSun = wd === 0
                return { day: d, meta: round2(meta), real: round2(real), delta: round2(real - meta), isSaturday: isSat, isSunday: isSun }
            })
        } else {
            // MODO CONTABILIDADE: soma sábado e domingo na sexta, não mostra fim de semana separado
            const relevantDays = dayList.filter(d => {
                if (!isSameOrBeforeDay(dayjs(d), refD)) return false
                const wd = dayjs(d).day()
                return wd >= 1 && wd <= 5 // apenas dias úteis
            })

            return relevantDays.map(d => {
                let meta = 0, real = 0
                const dayD = dayjs(d)

                for (const m of machines) {
                    meta += Number(effectiveTargetByMachineDay[m.id]?.[d] ?? 0)
                    real += Number(realByMachineDay[m.id]?.[d] ?? 0)

                    // Se for sexta-feira, soma o sábado e domingo seguintes
                    if (dayD.day() === 5) {
                        const saturday = ymd(dayD.add(1, 'day'))
                        const sunday = ymd(dayD.add(2, 'day'))
                        if (isSameOrBeforeDay(dayjs(saturday), refD)) {
                            real += Number(realByMachineDay[m.id]?.[saturday] ?? 0)
                        }
                        if (isSameOrBeforeDay(dayjs(sunday), refD)) {
                            real += Number(realByMachineDay[m.id]?.[sunday] ?? 0)
                        }
                    }
                }

                return { day: d, meta: round2(meta), real: round2(real), delta: round2(real - meta), isSaturday: false, isSunday: false }
            })
        }
    }, [dayList, dayHasProduction, effectiveTargetByMachineDay, machines, realByMachineDay, refDate, viewType])

    const visibleDailyTrack = dailyTrack.filter(d => !hiddenDays.includes(d.day))

    const machineMetrics = useMemo(() => {
        if (!refDate || !monthStart) return [] as MachineMetrics[]

        // Use selectedDay if set, otherwise fall back to refDate
        const activeDay = selectedDay ?? refDate

        // Para "dia", usa activeDay; para acumulado, sempre inclui tudo até activeDay
        const activeDayD = dayjs(activeDay)
        const refIso = viewType === 'contabilidade' && isSaturday(activeDayD)
            ? ymd(getPreviousFriday(activeDayD))
            : activeDay
        const accDays = dayList.filter(d => isSameOrBeforeDay(dayjs(d), activeDayD))
        const rows: MachineMetrics[] = []

        for (const m of machines) {
            if (!m.is_active) continue
            const mid = m.id

            let monthTarget = 0
            for (const d of dayList) monthTarget += Number(effectiveTargetByMachineDay[mid]?.[d] ?? 0)

            // Day target e real
            let dayTarget = 0
            let dayReal = 0

            if (viewType === 'contabilidade' && isSaturday(activeDayD)) {
                // Sábado: combina sexta + sábado
                const fridayIso = ymd(getPreviousFriday(activeDayD))
                dayTarget = Number(effectiveTargetByMachineDay[mid]?.[fridayIso] ?? 0)
                dayReal = Number(realByMachineDay[mid]?.[fridayIso] ?? 0) + Number(realByMachineDay[mid]?.[activeDay] ?? 0)
            } else {
                dayTarget = Number(effectiveTargetByMachineDay[mid]?.[refIso] ?? 0)
                dayReal = Number(realByMachineDay[mid]?.[refIso] ?? 0)
            }

            let accTarget = 0, accReal = 0
            for (const d of accDays) {
                accTarget += Number(effectiveTargetByMachineDay[mid]?.[d] ?? 0)
                accReal += Number(realByMachineDay[mid]?.[d] ?? 0)
            }

            rows.push({
                machine: m,
                monthTarget: round2(monthTarget),
                dayTarget: round2(dayTarget),
                dayReal: round2(dayReal),
                dayDelta: round2(dayReal - dayTarget),
                accTarget: round2(accTarget),
                accReal: round2(accReal),
                accDelta: round2(accReal - accTarget),
                pctDay: pct(dayReal, dayTarget),
                pctMonth: pct(accReal, accTarget),
            })
        }

        rows.sort((a, b) => {
            const sa = a.machine.sector?.sort_order ?? 0
            const sb = b.machine.sector?.sort_order ?? 0
            if (sa !== sb) return sa - sb
            return (a.machine.sort_order ?? 0) - (b.machine.sort_order ?? 0) || a.machine.code.localeCompare(b.machine.code)
        })
        return rows
    }, [refDate, monthStart, effectiveTargetByMachineDay, realByMachineDay, dayList, machines, viewType, selectedDay])

    const grouped = useMemo(() => {
        const bySector = new Map<string, { sector: MachineRow['sector']; items: MachineMetrics[] }>()
        for (const row of machineMetrics) {
            const sec = row.machine.sector
            if (!bySector.has(sec.id)) bySector.set(sec.id, { sector: sec, items: [] })
            bySector.get(sec.id)!.items.push(row)
        }
        const groups: GroupMetrics[] = []
        for (const { sector, items } of bySector.values()) {
            const monthTarget = round2(items.reduce((a, x) => a + x.monthTarget, 0))
            const dayTarget = round2(items.reduce((a, x) => a + x.dayTarget, 0))
            const dayReal = round2(items.reduce((a, x) => a + x.dayReal, 0))
            const accTarget = round2(items.reduce((a, x) => a + x.accTarget, 0))
            const accReal = round2(items.reduce((a, x) => a + x.accReal, 0))
            groups.push({
                key: sector.id,
                label: sector.name,
                sector,
                children: items,
                monthTarget,
                dayTarget,
                dayReal,
                dayDelta: round2(dayReal - dayTarget),
                accTarget,
                accReal,
                accDelta: round2(accReal - accTarget),
                pctDay: pct(dayReal, dayTarget),
                pctMonth: pct(accReal, accTarget),
            })
        }
        groups.sort((a, b) => (a.sector?.sort_order ?? 0) - (b.sector?.sort_order ?? 0))
        return groups
    }, [machineMetrics])

    // Total Geral
    const totalGeral = useMemo(() => {
        const monthTarget = round2(machineMetrics.reduce((a, x) => a + x.monthTarget, 0))
        const dayTarget = round2(machineMetrics.reduce((a, x) => a + x.dayTarget, 0))
        const dayReal = round2(machineMetrics.reduce((a, x) => a + x.dayReal, 0))
        const accTarget = round2(machineMetrics.reduce((a, x) => a + x.accTarget, 0))
        const accReal = round2(machineMetrics.reduce((a, x) => a + x.accReal, 0))
        return {
            monthTarget,
            dayTarget,
            dayReal,
            dayDelta: round2(dayReal - dayTarget),
            accTarget,
            accReal,
            accDelta: round2(accReal - accTarget),
            pctDay: pct(dayReal, dayTarget),
            pctMonth: pct(accReal, accTarget),
        }
    }, [machineMetrics])

    // Totais do dailyTrack
    const dailyTotals = useMemo(() => ({
        meta: dailyTrack.reduce((a, x) => a + x.meta, 0),
        real: dailyTrack.reduce((a, x) => a + x.real, 0),
        delta: dailyTrack.reduce((a, x) => a + x.delta, 0),
    }), [dailyTrack])

    async function exportResumo() {
        if (!resumoRef.current) return
        setBusy(true)
        try {
            const dataUrl = await toPng(resumoRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff' })
            const a = document.createElement('a')
            a.href = dataUrl
            a.download = `resumo_${effectiveRefDate ?? 'x'}.png`
            a.click()
        } catch (e: any) {
            setErr(e?.message ?? 'Falha ao exportar resumo.')
        } finally {
            setBusy(false)
        }
    }

    async function exportDetalhe() {
        if (!detalheRef.current) return
        setBusy(true)
        try {
            const dataUrl = await toPng(detalheRef.current, { cacheBust: true, pixelRatio: 3, backgroundColor: '#ffffff' })
            const a = document.createElement('a')
            a.href = dataUrl
            a.download = `detalhe_${effectiveRefDate ?? 'x'}.png`
            a.click()
        } catch (e: any) {
            setErr(e?.message ?? 'Falha ao exportar detalhe.')
        } finally {
            setBusy(false)
        }
    }

    // Estado vazio
    if (!busy && !batchIds.length) {
        return (
            <div className="card">
                <div className="card-body py-12 text-center">
                    <h1 className="page-title">Resultados</h1>
                    <p className="page-subtitle mt-2">Nenhum batch pronto. Importe um arquivo primeiro.</p>
                    <button onClick={() => load(selectedMonth)} className="btn btn-primary mt-6">Recarregar</button>
                </div>
            </div>
        )
    }

    const monthTitle = monthStart && effectiveRefDate ? `Produção — ${fmtMonthBR(monthStart)}` : 'Resultados'
    const displayRefDate = effectiveRefDate ?? refDate

    // Label adicional para contabilidade quando sábado é movido
    const saturdayMergedInfo = viewType === 'contabilidade' && refDate && isSaturday(dayjs(refDate))
        ? `(Sáb ${fmtDayBR(refDate)} somado na Sexta)`
        : null

    function handleDayClick(dayIso: string) {
        if (selectedDay === dayIso) {
            setSelectedDay(null)
        } else {
            setSelectedDay(dayIso)
        }
    }

    // Detail section title logic
    const detailTitle = selectedDay
        ? `Produção Detalhada — ${dayjs(selectedDay).format('DD/MM/YYYY')}` + (dayjs(selectedDay).day() === 6 ? ' (Sábado)' : '')
        : 'Produção por Setor / Máquina (Acumulado Mês)'

    return (
        <div className="space-y-6">
            {/* Header com ações */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    {/* Month Navigation */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                        <button
                            onClick={goToPreviousMonth}
                            disabled={busy}
                            style={{
                                background: 'transparent',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                cursor: busy ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#6b7280',
                                transition: 'all 0.2s',
                            }}
                            title="Mês anterior"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                        </button>
                        <h1 className="page-title section-header" style={{ margin: 0 }}>{monthTitle}</h1>
                        <button
                            onClick={goToNextMonth}
                            disabled={busy || !!(monthStart && dayjs(monthStart).add(1, 'month').isAfter(dayjs(), 'month'))}
                            style={{
                                background: 'transparent',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                cursor: (busy || (monthStart && dayjs(monthStart).add(1, 'month').isAfter(dayjs(), 'month'))) ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: (monthStart && dayjs(monthStart).add(1, 'month').isAfter(dayjs(), 'month')) ? '#d1d5db' : '#6b7280',
                                transition: 'all 0.2s',
                            }}
                            title="Próximo mês"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                        {selectedMonth && (
                            <button
                                onClick={goToLatestMonth}
                                disabled={busy}
                                style={{
                                    background: '#f3f4f6',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '6px 12px',
                                    cursor: busy ? 'not-allowed' : 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: '#4b5563',
                                }}
                                title="Ir para o mês mais recente"
                            >
                                Ir para atual
                            </button>
                        )}
                    </div>
                    <p className="page-subtitle mt-1">
                        Dados até <strong>{displayRefDate ? fmtDayBR(displayRefDate) : '—'}</strong>
                        {saturdayMergedInfo && <span style={{ color: '#ea580c', marginLeft: '8px', fontSize: '12px' }}>{saturdayMergedInfo}</span>}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* SWITCHER PRODUÇÃO / CONTABILIDADE */}
                    <div style={{
                        display: 'flex',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '2px solid #1e3a5f',
                    }}>
                        <button
                            onClick={() => setViewType('producao')}
                            style={{
                                padding: '8px 16px',
                                fontSize: '13px',
                                fontWeight: 600,
                                border: 'none',
                                cursor: 'pointer',
                                background: viewType === 'producao' ? '#1e3a5f' : '#fff',
                                color: viewType === 'producao' ? '#fff' : '#1e3a5f',
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v15z" />
                            </svg>
                            Produção
                        </button>
                        <button
                            onClick={() => setViewType('contabilidade')}
                            style={{
                                padding: '8px 16px',
                                fontSize: '13px',
                                fontWeight: 600,
                                border: 'none',
                                cursor: 'pointer',
                                background: viewType === 'contabilidade' ? '#1e3a5f' : '#fff',
                                color: viewType === 'contabilidade' ? '#fff' : '#1e3a5f',
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                <line x1="18" y1="20" x2="18" y2="10" />
                                <line x1="12" y1="20" x2="12" y2="4" />
                                <line x1="6" y1="20" x2="6" y2="14" />
                            </svg>
                            Contabilidade
                        </button>
                    </div>

                    <button onClick={exportResumo} disabled={busy} className="btn btn-accent">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                        </svg>
                        Resumo PNG
                    </button>
                    <button onClick={exportDetalhe} disabled={busy} className="btn btn-secondary">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                        </svg>
                        Detalhe PNG
                    </button>
                    <button onClick={() => load(selectedMonth)} disabled={busy} className="btn btn-primary">
                        {busy ? 'Carregando...' : 'Atualizar'}
                    </button>
                </div>
            </div>

            {err && <div className="alert alert-error"><span>{err}</span></div>}

            {/* ====== RESUMO (Ritmo Diário) ====== */}
            <div
                style={{ background: '#ffffff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
            >
                {/* Header do relatório - azul escuro */}
                <div style={{
                    background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
                    color: '#fff',
                    padding: '28px 32px',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {viewType === 'producao' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v15z" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="20" x2="18" y2="10" />
                                        <line x1="12" y1="20" x2="12" y2="4" />
                                        <line x1="6" y1="20" x2="6" y2="14" />
                                    </svg>
                                )}
                                <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>
                                    {monthTitle}
                                    <span style={{ fontSize: '14px', fontWeight: 500, marginLeft: '12px', opacity: 0.8 }}>
                                        ({viewType === 'producao' ? 'Produção' : 'Contabilidade'})
                                    </span>
                                </div>
                            </div>
                            <div style={{ fontSize: '14px', opacity: 0.7, marginTop: '6px' }}>
                                Referência: <strong style={{ color: '#93c5fd' }}>{displayRefDate ? fmtDayBR(displayRefDate) : '—'}</strong>
                                {saturdayMergedInfo && <span style={{ color: '#fbbf24', marginLeft: '8px' }}>{saturdayMergedInfo}</span>}
                                {' • '}Gerado: {dayjs().format('DD/MM/YYYY HH:mm')}
                            </div>
                        </div>

                        {/* KPIs grandes no header */}
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <BigKpi label="Meta Dia" value={hoursLabel(totalGeral.dayTarget)} />
                            <BigKpi label="Real Dia" value={hoursLabel(totalGeral.dayReal)} highlight />
                            <BigKpi label="Saldo Dia" value={hoursLabel(totalGeral.dayDelta)} delta={totalGeral.dayDelta} />
                            <BigKpi label="Ating. Mês" value={pctLabel(totalGeral.pctMonth)} accent />
                        </div>
                    </div>
                </div>

                <div style={{ padding: '32px' }}>
                    {/* ========== RITMO DIÁRIO ========== */}
                    <Section
                        title="Ritmo Diário — Meta x Real"
                        color="#1e3a5f"
                        headerAction={
                            hiddenDays.length > 0 && (
                                <button
                                    onClick={() => setHiddenDays([])}
                                    style={{
                                        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px',
                                        padding: '4px 8px', fontSize: '11px', color: '#1d4ed8', fontWeight: 600,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                    Exibir {hiddenDays.length} dias ocultos
                                </button>
                            )
                        }
                    >
                        <div style={{ overflowX: 'auto', background: '#fff' }}>
                            <table ref={resumoRef} style={{ width: 'max-content', borderCollapse: 'separate', borderSpacing: '0', fontSize: '14px' }}>
                                <thead>
                                    <tr>
                                        <Th left width={100} style={{ background: '#1e3a5f', color: '#fff', borderBottom: 'none', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>Dia</Th>
                                        {visibleDailyTrack.map(d => {
                                            const isSelected = selectedDay === d.day
                                            return (
                                                <Th
                                                    key={d.day}
                                                    onClick={() => handleDayClick(d.day)}
                                                    style={{
                                                        cursor: 'pointer',
                                                        background: isSelected ? '#ffffff' : '#1e3a5f',
                                                        color: isSelected ? '#1e3a5f' : '#fff',
                                                        borderBottom: isSelected ? 'none' : 'none',
                                                        position: 'relative'
                                                    }}
                                                >
                                                    <div className="group relative flex flex-col items-center justify-center">
                                                        <span style={{ fontSize: '16px', fontWeight: 700 }}>{dayjs(d.day).format('DD')}</span>
                                                        {d.isSaturday && <span style={{ display: 'block', fontSize: '9px', fontWeight: 600, opacity: 0.8 }}>SÁB</span>}
                                                        {d.isSunday && <span style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#fca5a5' }}>DOM</span>}

                                                        {/* Hide Button */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setHiddenDays(prev => [...prev, d.day])
                                                            }}
                                                            className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            style={{
                                                                background: '#fff', border: '1px solid #e5e7eb', borderRadius: '50%',
                                                                width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                                                color: '#64748b',
                                                                zIndex: 10
                                                            }}
                                                            title="Ocultar dia"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                                                <line x1="1" y1="1" x2="23" y2="23"></line>
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </Th>
                                            )
                                        })}
                                        <Th width={80} style={{ borderBottom: 'none', background: '#1e3a5f', color: '#fff' }}>TOTAL</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Linha META */}
                                    <tr>
                                        <Td left label style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' }}>META</Td>
                                        {visibleDailyTrack.map(d => {
                                            const isSelected = selectedDay === d.day
                                            return (
                                                <Td
                                                    key={d.day}
                                                    style={{ background: isSelected ? '#eff6ff' : '#fff', borderBottom: '1px solid #f1f5f9' }}
                                                >
                                                    {d.meta.toFixed(0)}
                                                </Td>
                                            )
                                        })}
                                        <Td bold style={{ background: '#fff', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f1f5f9', color: '#334155' }}>{dailyTotals.meta.toFixed(0)}</Td>
                                    </tr>

                                    {/* Linha REAL */}
                                    <tr>
                                        <Td left label style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' }}>REAL</Td>
                                        {visibleDailyTrack.map(d => {
                                            const isSelected = selectedDay === d.day
                                            return (
                                                <Td
                                                    key={d.day}
                                                    bold
                                                    style={{ background: isSelected ? '#eff6ff' : '#fff', borderBottom: '1px solid #f1f5f9' }}
                                                >
                                                    {d.real.toFixed(0)}
                                                </Td>
                                            )
                                        })}
                                        <Td bold style={{ background: '#fff', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f1f5f9', color: '#0f172a' }}>{dailyTotals.real.toFixed(0)}</Td>
                                    </tr>

                                    {/* Linha % ATINGIDO */}
                                    <tr>
                                        <Td left label style={{ borderTop: 'none', background: '#f8fafc', color: '#475569', borderRight: '1px solid #f1f5f9' }}>% ATING.</Td>
                                        {visibleDailyTrack.map(d => {
                                            const p = pct(d.real, d.meta)
                                            const isSelected = selectedDay === d.day
                                            const isGood = (p ?? 0) >= 1
                                            const color = isGood ? '#16a34a' : '#dc2626'

                                            return (
                                                <Td key={d.day} style={{
                                                    color, fontWeight: 700,
                                                    background: isSelected ? '#eff6ff' : '#fff',
                                                    borderTop: 'none',
                                                    borderBottom: 'none'
                                                }}>
                                                    {pctLabel(p)}
                                                </Td>
                                            )
                                        })}
                                        <Td bold style={{
                                            color: (pct(dailyTotals.real, dailyTotals.meta) ?? 0) >= 1 ? '#16a34a' : '#dc2626',
                                            borderTop: 'none',
                                            borderLeft: '1px solid #f1f5f9',
                                            background: '#fff'
                                        }}>
                                            {pctLabel(pct(dailyTotals.real, dailyTotals.meta))}
                                        </Td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </Section>
                </div>
            </div>

            {/* ====== DETALHE (Produção por Setor) ====== */}
            <div
                style={{ background: '#ffffff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '32px' }}
            >
                {/* ========== TABELA POR SETOR ========== */}
                <Section title={detailTitle} color="#1e3a5f" style={{ marginTop: '32px' }}>
                    <div ref={detalheRef} style={{ background: '#fff' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#1e3a5f' }}>
                                    <ThTable left>Estrutura</ThTable>
                                    <ThTable>Meta dia</ThTable>
                                    <ThTable>Real dia</ThTable>
                                    <ThTable>Δ dia</ThTable>
                                    <ThTable>Meta acum.</ThTable>
                                    <ThTable>Real acum.</ThTable>
                                    <ThTable>Δ acum.</ThTable>
                                    <ThTable>% dia</ThTable>
                                    <ThTable>% mês</ThTable>
                                </tr>
                            </thead>
                            <tbody>
                                {grouped.map(sec => {
                                    const open = expandedSectors[sec.key] ?? true
                                    const ms = sec.children ?? []
                                    return (
                                        <Fragment key={sec.key}>
                                            {/* Linha do Setor */}
                                            <tr
                                                style={{ background: '#f1f5f9', cursor: 'pointer' }}
                                                onClick={() => setExpandedSectors(p => ({ ...p, [sec.key]: !open }))}
                                            >
                                                <TdTable left bold>
                                                    <span style={{ display: 'inline-block', width: '20px', textAlign: 'center', marginRight: '8px', color: '#64748b', fontSize: '12px' }}>
                                                        {open ? '▼' : '▶'}
                                                    </span>
                                                    {sec.label}
                                                </TdTable>
                                                <TdTable bold>{hoursLabel(sec.dayTarget)}</TdTable>
                                                <TdTable bold>{hoursLabel(sec.dayReal)}</TdTable>
                                                <TdTable bold delta={sec.dayDelta}>{hoursLabel(sec.dayDelta)}</TdTable>
                                                <TdTable bold>{hoursLabel(sec.accTarget)}</TdTable>
                                                <TdTable bold>{hoursLabel(sec.accReal)}</TdTable>
                                                <TdTable bold delta={sec.accDelta}>{hoursLabel(sec.accDelta)}</TdTable>
                                                <TdTable bold pct={sec.pctDay}>{pctLabel(sec.pctDay)}</TdTable>
                                                <TdTable bold pct={sec.pctMonth}>{pctLabel(sec.pctMonth)}</TdTable>
                                            </tr>
                                            {/* Máquinas */}
                                            {open && ms.map(m => (
                                                <tr key={m.machine.id} style={{ background: '#fff' }}>
                                                    <TdTable left style={{ paddingLeft: '36px' }}>
                                                        <span
                                                            style={{ fontWeight: 600, color: '#18181b', cursor: 'pointer', textDecoration: 'underline' }}
                                                            onClick={() => setSelectedMachine(m.machine)}
                                                        >
                                                            {m.machine.code}
                                                        </span>
                                                        <span style={{ color: '#94a3b8', marginLeft: '10px', fontSize: '11px' }}>{m.machine.name_display}</span>
                                                    </TdTable>
                                                    <TdTable muted0={m.dayTarget === 0}>{hoursLabel(m.dayTarget)}</TdTable>
                                                    <TdTable muted0={m.dayReal === 0}>{hoursLabel(m.dayReal)}</TdTable>
                                                    <TdTable delta={m.dayDelta}>{hoursLabel(m.dayDelta)}</TdTable>
                                                    <TdTable muted0={m.accTarget === 0}>{hoursLabel(m.accTarget)}</TdTable>
                                                    <TdTable muted0={m.accReal === 0}>{hoursLabel(m.accReal)}</TdTable>
                                                    <TdTable delta={m.accDelta}>{hoursLabel(m.accDelta)}</TdTable>
                                                    <TdTable pct={m.pctDay}>{pctLabel(m.pctDay)}</TdTable>
                                                    <TdTable pct={m.pctMonth}>{pctLabel(m.pctMonth)}</TdTable>
                                                </tr>
                                            ))}
                                        </Fragment>
                                    )
                                })}

                                {/* TOTAL GERAL */}
                                <tr style={{ background: '#0f172a' }}>
                                    <TdTable left bold style={{ color: '#fff', fontSize: '17px', padding: '10px 6px' }}>TOTAL GERAL</TdTable>
                                    <TdTable bold style={{ color: '#fff', fontSize: '17px', padding: '10px 6px' }}>{hoursLabel(totalGeral.dayTarget)}</TdTable>
                                    <TdTable bold style={{ color: '#fff', fontSize: '17px', padding: '10px 6px' }}>{hoursLabel(totalGeral.dayReal)}</TdTable>
                                    <TdTable bold style={{ color: totalGeral.dayDelta < 0 ? '#fca5a5' : totalGeral.dayDelta > 0 ? '#86efac' : '#fff', fontSize: '17px', padding: '10px 6px' }}>
                                        {hoursLabel(totalGeral.dayDelta)}
                                    </TdTable>
                                    <TdTable bold style={{ color: '#fff', fontSize: '17px', padding: '10px 6px' }}>{hoursLabel(totalGeral.accTarget)}</TdTable>
                                    <TdTable bold style={{ color: '#fff', fontSize: '17px', padding: '10px 6px' }}>{hoursLabel(totalGeral.accReal)}</TdTable>
                                    <TdTable bold style={{ color: totalGeral.accDelta < 0 ? '#fca5a5' : totalGeral.accDelta > 0 ? '#86efac' : '#fff', fontSize: '17px', padding: '10px 6px' }}>
                                        {hoursLabel(totalGeral.accDelta)}
                                    </TdTable>
                                    <TdTable bold style={{ color: (totalGeral.pctDay ?? 0) >= 1 ? '#86efac' : '#fca5a5', fontSize: '18px', padding: '10px 6px' }}>
                                        {pctLabel(totalGeral.pctDay)}
                                    </TdTable>
                                    <TdTable bold style={{ color: (totalGeral.pctMonth ?? 0) >= 1 ? '#86efac' : '#fff', fontSize: '18px', padding: '10px 6px' }}>
                                        {pctLabel(totalGeral.pctMonth)}
                                    </TdTable>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Section>
            </div>
            {/* MODAL DETALHE MÁQUINA */}
            {selectedMachine && batchIds.length > 0 && (
                <MachineDetailModal
                    batchIds={batchIds}
                    machine={selectedMachine}
                    day={selectedDay ?? refDate ?? ''}
                    viewType={viewType}
                    onClose={() => setSelectedMachine(null)}
                />
            )}
        </div>
    )
}

function MachineDetailModal({ batchIds, machine, day, viewType, onClose }: {
    batchIds: string[],
    machine: MachineRow,
    day: string,
    viewType: ViewType,
    onClose: () => void
}) {
    const [rows, setRows] = useState<RawProductionRow[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let active = true
        async function fetch() {
            setLoading(true)
            try {
                const targetDays = [day]
                if (viewType === 'contabilidade' && dayjs(day).day() === 5) {
                    // Sexta contábil inclui sábado
                    targetDays.push(ymd(dayjs(day).add(1, 'day')))
                }
                const res = await fetchRawRowsForMachine(batchIds, machine.id, targetDays)
                if (active) setRows(res)
            } catch (err) {
                console.error(err)
            } finally {
                if (active) setLoading(false)
            }
        }
        fetch()
        return () => { active = false }
    }, [batchIds, machine.id, day, viewType])

    const total = rows.reduce((acc, r) => acc + Number(r.hours ?? 0), 0)

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={onClose}>
            <div style={{
                background: '#fff', borderRadius: '12px', padding: '24px',
                width: '100%', maxWidth: '600px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                maxHeight: '80vh', overflowY: 'auto'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                    <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e3a5f' }}>
                            {machine.code} — {machine.name_display}
                        </h3>
                        <p style={{ fontSize: '14px', color: '#64748b' }}>
                            Extrato do dia <strong>{dayjs(day).format('DD/MM/YYYY')}</strong>
                            {viewType === 'contabilidade' && dayjs(day).day() === 5 && ' (+Sábado)'}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Carregando...</div>
                ) : rows.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontStyle: 'italic' }}>
                        Nenhum registro encontrado para este dia.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                <th style={{ textAlign: 'left', padding: '8px', color: '#64748b' }}>Data</th>
                                <th style={{ textAlign: 'left', padding: '8px', color: '#64748b' }}>Categoria Original (Import)</th>
                                <th style={{ textAlign: 'right', padding: '8px', color: '#64748b' }}>Horas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '8px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                        {dayjs(r.prod_day).format('DD/MM')}
                                        {dayjs(r.prod_day).day() === 6 && <span style={{ fontSize: '9px', marginLeft: '6px', background: '#e0f2fe', color: '#0369a1', padding: '2px 5px', borderRadius: '4px' }}>SÁB</span>}
                                    </td>
                                    <td style={{ padding: '8px', color: '#334155' }}>
                                        {r.machine_raw}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: '8px', fontWeight: 700, color: r.hours < 0 ? '#dc2626' : '#1e3a5f' }}>
                                        {Number(r.hours).toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                            <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                                <td colSpan={2} style={{ padding: '12px 8px', fontWeight: 700 }}>TOTAL</td>
                                <td style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 800, fontSize: '16px', color: '#1e3a5f' }}>
                                    {total.toFixed(2)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

// ========== COMPONENTES AUXILIARES ==========

function Section({ title, color, subtitle, children, style, headerAction }: { title: string; color: string; subtitle?: string; children: React.ReactNode; style?: React.CSSProperties, headerAction?: React.ReactNode }) {
    return (
        <div style={style}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '5px', height: '24px', background: color, borderRadius: '3px' }} />
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#18181b' }}>{title}</div>
                        {subtitle && <div style={{ fontSize: '12px', color: '#64748b' }}>{subtitle}</div>}
                    </div>
                </div>
                {headerAction}
            </div>
            <div style={{ borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {children}
            </div>
        </div>
    )
}

function BigKpi({ label, value, delta, highlight, accent }: { label: string; value: string; delta?: number; highlight?: boolean; accent?: boolean }) {
    const isNeg = delta != null && delta < 0
    const isPos = delta != null && delta > 0
    return (
        <div style={{
            background: accent ? 'rgba(59, 130, 246, 0.3)' : highlight ? 'rgba(251, 191, 36, 0.3)' : 'rgba(255,255,255,0.15)',
            padding: '12px 20px',
            borderRadius: '12px',
            textAlign: 'center',
            minWidth: '100px',
            backdropFilter: 'blur(8px)',
        }}>
            <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
            <div style={{
                fontSize: '22px',
                fontWeight: 800,
                color: isNeg ? '#fca5a5' : isPos ? '#86efac' : accent ? '#93c5fd' : highlight ? '#fbbf24' : '#fff',
            }}>
                {value}
            </div>
        </div>
    )
}

// Células para tabela de Ritmo Diário
function Th({ children, left, accent, width, onClick, style }: { children?: React.ReactNode; left?: boolean; accent?: boolean; width?: number; onClick?: () => void; style?: React.CSSProperties }) {
    return (
        <th
            onClick={onClick}
            style={{
                padding: '12px 8px',
                textAlign: left ? 'left' : 'center',
                fontWeight: 600,
                fontSize: '12px',
                background: accent ? '#1e3a5f' : '#f8fafc',
                color: accent ? '#fff' : '#64748b',
                borderBottom: '2px solid #e5e7eb',
                width: width,
                minWidth: width ?? 56,
                ...style,
            }}
        >
            {children}
        </th>
    )
}

function Td({ children, left, label, accent, muted, bold, big, style }: {
    children?: React.ReactNode; left?: boolean; label?: boolean; accent?: boolean; muted?: boolean; bold?: boolean; big?: boolean; style?: React.CSSProperties
}) {
    return (
        <td style={{
            padding: big ? '14px 8px' : '10px 8px',
            textAlign: left ? 'left' : 'center',
            fontWeight: bold ? 700 : label ? 600 : 400,
            fontSize: big ? '18px' : label ? '11px' : '14px',
            color: accent ? '#fff' : label ? '#64748b' : muted ? '#94a3b8' : '#18181b',
            background: label ? '#f8fafc' : accent ? '#1e3a5f' : undefined,
            borderBottom: '1px solid #e5e7eb',
            letterSpacing: label ? '0.5px' : undefined,
            ...style,
        }}>
            {children}
        </td>
    )
}

// Células para tabela de Setor/Máquina
function ThTable({ children, left }: { children: React.ReactNode; left?: boolean }) {
    return (
        <th style={{
            padding: '8px 6px',
            textAlign: left ? 'left' : 'right',
            fontWeight: 700,
            fontSize: '18px',
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
            color: '#fff',
        }}>
            {children}
        </th>
    )
}

function TdTable({ children, left, bold, delta, pct, muted0, style }: {
    children: React.ReactNode; left?: boolean; bold?: boolean; delta?: number; pct?: number | null; muted0?: boolean; style?: React.CSSProperties
}) {
    let color: string | undefined
    if (delta != null) {
        color = delta < 0 ? '#dc2626' : delta > 0 ? '#16a34a' : '#71717a'
    } else if (pct != null) {
        color = pct >= 1 ? '#16a34a' : '#64748b'
    } else if (muted0) {
        color = '#cbd5e1'
    }

    return (
        <td style={{
            padding: '6px 4px',
            textAlign: left ? 'left' : 'right',
            fontWeight: bold ? 700 : 500,
            fontSize: '16px',
            color: color ?? '#18181b',
            borderBottom: '1px solid #e5e7eb',
            ...style,
        }}>
            {children}
        </td>
    )
}
