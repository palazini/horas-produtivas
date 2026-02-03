import ExcelJS from 'exceljs'
import dayjs from 'dayjs'
import type { MachineRow } from '../features/results/resultsService'

export type ExportMachineMetrics = {
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

export type ExportGroupMetrics = {
    key: string
    label: string
    sector?: MachineRow['sector']
    children?: ExportMachineMetrics[]
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

// Daily Track Summary Item from ResultsPage - Replicated for type safety
export type DailyTrackSummaryItem = {
    day: string
    meta: number
    real: number
    delta: number
    isSaturday: boolean
    isSunday: boolean
}

// Colors
const COLORS = {
    headerBg: '4472C4', // Standard Excel Blue
    headerText: 'ffffff',
    sectorBg: 'f3f4f6', // Light Gray
    border: 'd1d5db',
    weekendBg: 'fff7ed', // Orange tint for weekends content (not headers)
    deltaPositive: '107c41', // Green
    deltaNegative: 'ef4444', // Red
}

export async function generateResultsExcel(
    groups: ExportGroupMetrics[],
    refDate: string,
    viewType: 'producao' | 'contabilidade',
    dailyTrack?: DailyTrackSummaryItem[] // NEW: Daily Summary Data
) {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ProdMetas'
    workbook.created = new Date()

    // Formatting Helpers
    const styles = {
        header: {
            font: { bold: true, color: { argb: COLORS.headerText }, size: 11, name: 'Calibri' },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } } as ExcelJS.Fill,
            alignment: { horizontal: 'center', vertical: 'middle' } as ExcelJS.Alignment,
            border: {
                top: { style: 'thin', color: { argb: COLORS.border } },
                left: { style: 'thin', color: { argb: COLORS.border } },
                bottom: { style: 'thin', color: { argb: COLORS.border } },
                right: { style: 'thin', color: { argb: COLORS.border } }
            } as ExcelJS.Borders
        },
        cell: {
            font: { name: 'Calibri', size: 11 },
            alignment: { vertical: 'middle' } as ExcelJS.Alignment,
            border: {
                top: { style: 'thin', color: { argb: COLORS.border } },
                left: { style: 'thin', color: { argb: COLORS.border } },
                bottom: { style: 'thin', color: { argb: COLORS.border } },
                right: { style: 'thin', color: { argb: COLORS.border } }
            } as ExcelJS.Borders
        },
        sector: {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sectorBg } } as ExcelJS.Fill,
            font: { bold: true, name: 'Calibri', size: 11 }
        }
    }

    // --- SHEET 1: RITMO DIÁRIO (Now First) ---
    if (dailyTrack && dailyTrack.length > 0) {
        const sheetRitmo = workbook.addWorksheet('Ritmo Diário', {
            views: [{ showGridLines: false }]
        })

        // Title
        const rTitle = sheetRitmo.getCell('B1') // Offset to start at B
        rTitle.value = `Ritmo Diário — Consolidados`
        rTitle.font = { bold: true, size: 16, name: 'Calibri' }
        rTitle.alignment = { horizontal: 'left' }
        sheetRitmo.getRow(1).height = 30

        // Determine Columns (Dates)
        // Data starts at Column C (Index 3)
        // Col A: Spacer/Legend
        // Col B: Headers (Meta, Real, etc)
        // Col C+: Days

        let colIdx = 3

        // Setup Row Labels
        const labelRowIdx = 3 // Dates Row
        const metaRowIdx = 4
        const realRowIdx = 5
        const deltaRowIdx = 6
        const pctRowIdx = 7

        const rowLabels = {
            [metaRowIdx]: 'Meta (h)',
            [realRowIdx]: 'Real (h)',
            [deltaRowIdx]: 'Delta (h)',
            [pctRowIdx]: 'Atingimento'
        }

        // Write Row Labels in Column 2 (B)
        Object.entries(rowLabels).forEach(([rIdx, label]) => {
            const cell = sheetRitmo.getCell(Number(rIdx), 2)
            cell.value = label
            cell.style = styles.header
            cell.alignment = { ...styles.header.alignment, horizontal: 'left' }
        })
        sheetRitmo.getColumn(2).width = 20

        // Initialize Totals
        let totalMeta = 0
        let totalReal = 0

        // Iterate Dates
        dailyTrack.forEach(item => {
            totalMeta += item.meta
            totalReal += item.real

            // Header: Date
            const dateCell = sheetRitmo.getCell(labelRowIdx, colIdx)
            dateCell.value = dayjs(item.day).format('DD/MM') +
                (item.isSaturday ? ' (Sáb)' : '') +
                (item.isSunday ? ' (Dom)' : '')

            dateCell.style = styles.header
            // Removed manual yellow override for weekends headers to keep them Blue

            // Values
            // Meta
            const cellMeta = sheetRitmo.getCell(metaRowIdx, colIdx)
            cellMeta.value = item.meta
            cellMeta.style = { ...styles.cell }
            cellMeta.numFmt = '#,##0.00'

            // Real
            const cellReal = sheetRitmo.getCell(realRowIdx, colIdx)
            cellReal.value = item.real
            cellReal.style = { ...styles.cell }
            cellReal.numFmt = '#,##0.00'

            // Delta
            const cellDelta = sheetRitmo.getCell(deltaRowIdx, colIdx)
            cellDelta.value = item.delta
            cellDelta.style = { ...styles.cell }
            cellDelta.numFmt = '#,##0.00'
            cellDelta.font = {
                name: 'Calibri',
                color: { argb: item.delta >= 0 ? COLORS.deltaPositive : COLORS.deltaNegative },
                bold: true
            }

            // %
            const pctVal = item.meta > 0 ? (item.real / item.meta) : (item.real > 0 ? 1 : 0)
            const cellPct = sheetRitmo.getCell(pctRowIdx, colIdx)
            cellPct.value = pctVal // Raw number, format handles display
            cellPct.style = { ...styles.cell }
            cellPct.numFmt = '0.0%'
            if (item.meta > 0) {
                cellPct.font = {
                    name: 'Calibri',
                    color: { argb: item.real >= item.meta ? COLORS.deltaPositive : COLORS.deltaNegative },
                    bold: true
                }
            }

            // Apply weekend background to value cells (Keeping this light orange for readability)
            if (item.isSaturday || item.isSunday) {
                const bgFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.weekendBg } }
                cellMeta.fill = bgFill
                cellReal.fill = bgFill
                cellDelta.fill = bgFill
                cellPct.fill = bgFill
            }

            sheetRitmo.getColumn(colIdx).width = 15
            colIdx++
        })

        // --- TOTAL COLUMN ---
        const totalDelta = totalReal - totalMeta
        const totalPct = totalMeta > 0 ? (totalReal / totalMeta) : (totalReal > 0 ? 1 : 0)

        // Header
        const totalHeaderCell = sheetRitmo.getCell(labelRowIdx, colIdx)
        totalHeaderCell.value = 'TOTAL'
        totalHeaderCell.style = styles.header

        // Value: Meta
        const totalMetaCell = sheetRitmo.getCell(metaRowIdx, colIdx)
        totalMetaCell.value = totalMeta
        totalMetaCell.style = { ...styles.cell, font: { ...styles.cell.font, bold: true } }
        totalMetaCell.numFmt = '#,##0.00'

        // Value: Real
        const totalRealCell = sheetRitmo.getCell(realRowIdx, colIdx)
        totalRealCell.value = totalReal
        totalRealCell.style = { ...styles.cell, font: { ...styles.cell.font, bold: true } }
        totalRealCell.numFmt = '#,##0.00'

        // Value: Delta
        const totalDeltaCell = sheetRitmo.getCell(deltaRowIdx, colIdx)
        totalDeltaCell.value = totalDelta
        totalDeltaCell.style = { ...styles.cell, font: { ...styles.cell.font, bold: true } }
        totalDeltaCell.numFmt = '#,##0.00'
        totalDeltaCell.font = {
            ...totalDeltaCell.font,
            color: { argb: totalDelta >= 0 ? COLORS.deltaPositive : COLORS.deltaNegative }
        }

        // Value: %
        const totalPctCell = sheetRitmo.getCell(pctRowIdx, colIdx)
        totalPctCell.value = totalPct
        totalPctCell.style = { ...styles.cell, font: { ...styles.cell.font, bold: true } }
        totalPctCell.numFmt = '0.0%'
        totalPctCell.font = {
            ...totalPctCell.font,
            color: { argb: totalPct >= 1 ? COLORS.deltaPositive : COLORS.deltaNegative }
        }

        sheetRitmo.getColumn(colIdx).width = 18
        colIdx++

        // Add Border to the whole block
        const endColIdx = colIdx - 1
        for (let r = 3; r <= 7; r++) {
            for (let c = 2; c <= endColIdx; c++) {
                const cell = sheetRitmo.getCell(r, c)
                cell.border = styles.cell.border
            }
        }
    }

    // --- SHEET 2: RESUMO (Was First) ---
    const sheetResumo = workbook.addWorksheet('Resumo', {
        views: [{ showGridLines: false }]
    })

    // Title Rows
    sheetResumo.mergeCells('A1:L1')
    const titleCell = sheetResumo.getCell('A1')
    titleCell.value = `Relatório de Produção — ${titleCase(viewType)} — Ref: ${dayjs(refDate).format('DD/MM/YYYY')}`
    titleCell.font = { bold: true, size: 16, name: 'Calibri' }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheetResumo.getRow(1).height = 30

    // Headers
    // Row 3: Main Headers
    const headerRow1 = sheetResumo.getRow(3)
    headerRow1.height = 20
    headerRow1.values = ['Setor', 'Máquina', 'Meta Mês (h)', '', 'ACUMULADO', '', '', '', 'DIA', '', '', '']
    sheetResumo.mergeCells('E3:H3') // Acumulado
    sheetResumo.mergeCells('I3:L3') // Dia

    // Row 4: Sub Headers
    const headerRow2 = sheetResumo.getRow(4)
    headerRow2.height = 20
    headerRow2.values = [
        '', '', '', '',
        'Meta (h)', 'Real (h)', 'Delta (h)', '%',
        'Meta (h)', 'Real (h)', 'Delta (h)', '%'
    ]

        // Apply styles to headers
        ;[headerRow1, headerRow2].forEach(row => {
            for (let i = 1; i <= 12; i++) {
                const cell = row.getCell(i)
                cell.style = { ...styles.header }
                cell.border = styles.header.border
            }
        })

    // Fix merge borders
    sheetResumo.getCell('A3').style = styles.header
    sheetResumo.getCell('B3').style = styles.header
    sheetResumo.getCell('C3').style = styles.header

    // Set column widths
    sheetResumo.columns = [
        { width: 25 }, { width: 40 }, { width: 15 }, { width: 2 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }
    ]

    let currentRowIdx = 5

    groups.forEach(g => {
        // Sector Header
        const row = sheetResumo.getRow(currentRowIdx)
        row.values = [
            g.label.toUpperCase(),
            '(Total Setor)',
            g.monthTarget,
            '',
            g.accTarget,
            g.accReal,
            g.accDelta,
            g.pctMonth ?? 0,
            g.dayTarget,
            g.dayReal,
            g.dayDelta,
            g.pctDay ?? 0
        ]
        row.height = 22

        row.eachCell((cell, col) => {
            // SPREAD to create a new object and avoid mutation of the constant
            cell.style = { ...styles.cell, ...styles.sector }
            cell.border = styles.cell.border
            applyNumberFormat(cell, col)
            applyConditionalFormatting(cell, col, g.accDelta, g.dayDelta, g.pctMonth, g.pctDay)
        })
        currentRowIdx++

        // Machines
        if (g.children) {
            g.children.forEach(m => {
                const r = sheetResumo.getRow(currentRowIdx)
                r.values = [
                    g.label,
                    m.machine.name_display,
                    m.monthTarget,
                    '',
                    m.accTarget,
                    m.accReal,
                    m.accDelta,
                    m.pctMonth ?? 0,
                    m.dayTarget,
                    m.dayReal,
                    m.dayDelta,
                    m.pctDay ?? 0
                ]
                r.eachCell((cell, col) => {
                    // CRITICAL: Spread styles.cell to avoid sharing the reference.
                    // If we don't spread, modifying cell.numFmt below mutates the shared 'styles.cell' object,
                    // causing subsequent cells (like Hours) to inherit '0.0%' format from previous loops.
                    cell.style = { ...styles.cell }
                    applyNumberFormat(cell, col)
                    applyConditionalFormatting(cell, col, m.accDelta, m.dayDelta, m.pctMonth, m.pctDay)
                })
                currentRowIdx++
            })
        }
        currentRowIdx++ // Spacer
    })

    // Export
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    // Download Link
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Producao_${titleCase(viewType)}_${dayjs(refDate).format('YYYY-MM-DD')}.xlsx`
    a.click()
    window.URL.revokeObjectURL(url)
}

function applyNumberFormat(cell: ExcelJS.Cell, col: number) {
    // Cols (1-based):
    // 3: Meta Mes, 5: Acc Target, 6: Acc Real, 7: Acc Delta, 8: Acc %
    // 9: Day Target, 10: Day Real, 11: Day Delta, 12: Day %
    if ([3, 5, 6, 7, 9, 10, 11].includes(col)) {
        cell.numFmt = '#,##0.00'
    } else if (col === 8 || col === 12) {
        cell.numFmt = '0.0%'
    }
}

function applyConditionalFormatting(
    cell: ExcelJS.Cell,
    col: number,
    accDelta: number,
    dayDelta: number,
    accPct: number | null,
    dayPct: number | null
) {
    const isPositive = (val: number) => val >= 0
    const isGoodPct = (val: number | null) => val != null && val >= 1

    // Delta Coloring
    if (col === 7) { // Acc Delta
        cell.font = { ...cell.font, color: { argb: isPositive(accDelta) ? COLORS.deltaPositive : COLORS.deltaNegative } }
    }
    if (col === 11) { // Day Delta
        cell.font = { ...cell.font, color: { argb: isPositive(dayDelta) ? COLORS.deltaPositive : COLORS.deltaNegative } }
    }

    // Percentage Coloring (Optional, but requested "elegant" often implies visual cues)
    // Applying same logic: Green if >= 100%, Red if < 100%
    if (col === 8) { // Acc %
        cell.font = { ...cell.font, color: { argb: isGoodPct(accPct) ? COLORS.deltaPositive : COLORS.deltaNegative } }
    }
    if (col === 12) { // Day %
        cell.font = { ...cell.font, color: { argb: isGoodPct(dayPct) ? COLORS.deltaPositive : COLORS.deltaNegative } }
    }
}

function titleCase(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}
