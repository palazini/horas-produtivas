import { useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseWipXlsx, type ParseResult } from '../features/import/parseWipXlsx'
import { uploadAndProcessBatch, setActiveBatchId } from '../features/import/uploadBatch'

export function ImportPage() {
  const nav = useNavigate()

  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)      // envio / processamento
  const [parsing, setParsing] = useState(false) // leitura do excel
  const [dragActive, setDragActive] = useState(false)

  // força reset do input pra permitir escolher o mesmo arquivo novamente
  const [inputKey, setInputKey] = useState(0)

  const summary = useMemo(() => {
    if (!parsed) return null
    return [
      { label: 'Linhas válidas', value: String(parsed.stats.rowCount) },
      { label: 'Máquinas', value: String(parsed.stats.machines) },
      { label: 'Horas (total)', value: String(parsed.stats.hoursTotal) },
      { label: 'Período', value: `${parsed.stats.dayMin ?? '-'} → ${parsed.stats.dayMax ?? '-'}` },
      { label: 'Referência', value: parsed.refDate ?? '-' },
    ]
  }, [parsed])

  async function onPick(f: File) {
    setErr(null)
    setParsed(null)
    setFile(f)

    setParsing(true)
    try {
      const res = await parseWipXlsx(f)
      setParsed(res)
    } catch (e: any) {
      setParsed(null)
      setErr(e?.message ?? 'Falha ao ler Excel.')
    } finally {
      setParsing(false)
    }
  }

  async function onSend() {
    if (!parsed || busy) return
    setBusy(true)
    setErr(null)

    try {
      const out = await uploadAndProcessBatch({
        rows: parsed.rows,
        refDate: parsed.refDate,
        yearMonth: parsed.yearMonth,
      })

      if (!out?.ok) {
        setErr(out?.message ?? 'Falha ao processar.')
        return
      }

      // ✅ importante: fixa o batch atual p/ Aliases e Results não pegarem “latest”
      if (out.batchId) setActiveBatchId(out.batchId)

      if (out.status === 'needs_alias') nav('/aliases')
      else nav('/results')
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao enviar/processar.')
    } finally {
      setBusy(false)
    }
  }

  function clearFile() {
    setFile(null)
    setParsed(null)
    setErr(null)
    setInputKey((k) => k + 1)
  }

  function handleDrag(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    if (e.type === 'dragleave') setDragActive(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (!f) return

    const ok = f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')
    if (!ok) {
      setErr('Formato inválido. Envie um arquivo .xlsx ou .xls')
      return
    }
    onPick(f)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title section-header">Importar Planilha</h1>
          <p className="page-subtitle mt-2">
            Faça upload do Excel com os dados de produção para consolidação por dia e máquina.
          </p>
        </div>
        <div className="badge badge-info">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          Upload + Processamento
        </div>
      </div>

      {/* Main Upload Card */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-3">
            <div className="icon-box icon-box-accent">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                Upload do Arquivo
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Data do WIP • Alíquota • Categoria
              </div>
            </div>
          </div>

          {(file && parsed && !parsing) && (
            <div className="badge badge-success">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Arquivo validado
            </div>
          )}

          {parsing && (
            <div className="badge badge-neutral">
              Lendo Excel…
            </div>
          )}
        </div>

        <div className="card-body space-y-5">
          {/* Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className="relative rounded-xl transition-all"
            style={{
              padding: '2.5rem',
              border: `2px dashed ${dragActive ? 'var(--color-accent)' : 'var(--color-border-medium)'}`,
              background: dragActive ? 'var(--color-accent-light)' : 'var(--color-surface-1)',
              opacity: busy ? 0.7 : 1,
              pointerEvents: busy ? 'none' : 'auto',
            }}
          >
            <input
              key={inputKey}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPick(f)
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={busy}
            />
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 p-4 rounded-2xl" style={{ background: 'var(--color-surface-2)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M12 18v-6" />
                  <path d="m9 15 3-3 3 3" />
                </svg>
              </div>
              <div className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                Arraste e solte o arquivo Excel aqui
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                ou clique para selecionar • .xlsx, .xls
              </div>
            </div>
          </div>

          {/* File info */}
          {file && (
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border-light)' }}
            >
              <div className="icon-box" style={{ background: '#dcfce7' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {file.name}
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <button
                onClick={clearFile}
                className="p-2 rounded-lg hover:bg-white transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
                disabled={busy || parsing}
                title="Remover arquivo"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Error alert */}
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

          {/* Summary metrics */}
          {summary && (
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
                Resumo do Arquivo
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {summary.map((s) => (
                  <div key={s.label} className="metric-card">
                    <div className="metric-label">{s.label}</div>
                    <div className="metric-value-sm">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--color-border-light)' }}>
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {parsing ? 'Lendo arquivo…' : parsed ? 'Arquivo pronto para processamento' : 'Aguardando arquivo...'}
            </div>

            <button
              disabled={!parsed || busy || parsing}
              onClick={onSend}
              className="btn btn-primary"
              style={{ minWidth: '160px' }}
            >
              {busy ? (
                <>
                  <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Processando…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                  Enviar e processar
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Info Card (pode manter igual ao seu) */}
      {/* ... */}
    </div>
  )
}
