import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import {
  Archive,
  Check,
  ChevronRight,
  Clipboard,
  Clock3,
  Code2,
  Download,
  FileArchive,
  FolderOpen,
  ImagePlus,
  Layers3,
  LockKeyhole,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { createBatchArchive } from "./core/batch"
import { generateOutput, outputFormats, outputLabels, type OutputFormat } from "./core/exporters"
import {
  analyzeImageData,
  buildPalette,
  collapseImageData,
  verifyLossless,
  type PixelAnalysis,
  type PixelData,
} from "./core/pixel"
import { clearHistory, deleteHistory, listHistory, saveHistory, type HistoryRecord } from "./lib/history"
import { decodePNG, downloadBlob, formatBytes, isPNG } from "./lib/image"

type QueueItem = {
  id: string
  historyId: string
  file: File
  image: PixelData
  analysis: PixelAnalysis
  previewURL: string
}

type Settings = {
  autoScale: boolean
  preserveDimensions: boolean
  customPixelSize: number
  format: OutputFormat
  codeLimit: number
}

type PreparedItem = {
  item: QueueItem
  logical: PixelData
  factor: number
  pixelSize: number
  mismatch: number
  output: ReturnType<typeof generateOutput>
}

const defaultSettings: Settings = {
  autoScale: true,
  preserveDimensions: true,
  customPixelSize: 1,
  format: "compact-html",
  codeLimit: 65535,
}

function prepareItem(item: QueueItem, settings: Settings): PreparedItem {
  const factor = settings.autoScale ? item.analysis.detectedScale : 1
  const logical = collapseImageData(item.image, factor)
  const pixelSize = settings.preserveDimensions ? factor : settings.customPixelSize
  return {
    item,
    logical,
    factor,
    pixelSize,
    mismatch: verifyLossless(item.image, logical, factor),
    output: generateOutput(settings.format, logical, pixelSize, item.file.name),
  }
}

function baseName(name: string) {
  return name.replace(/\.png$/i, "").replace(/[^\p{L}\p{N}._-]+/gu, "-") || "pixel-art"
}

function SourcePreview({ image, zoom }: { image: PixelData; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext("2d")?.putImageData(new ImageData(image.data, image.width, image.height), 0, 0)
  }, [image])

  return (
    <canvas
      ref={ref}
      className="source-canvas"
      style={{ width: image.width * zoom, height: image.height * zoom }}
      aria-label="원본 PNG 미리보기"
    />
  )
}

function CSSPreview({ prepared, zoom }: { prepared: PreparedItem; zoom: number }) {
  const visible = prepared.logical.data.reduce((count, _, index) => index % 4 === 3 && prepared.logical.data[index] > 0 ? count + 1 : count, 0)
  if (visible > 60000) {
    return <div className="preview-warning">가시 픽셀이 60,000개를 넘어 CSS 미리보기만 생략했습니다. 출력 코드는 생성되어 있습니다.</div>
  }

  const width = prepared.logical.width * prepared.pixelSize
  const height = prepared.logical.height * prepared.pixelSize
  return (
    <div className="zoom-frame" style={{ width: width * zoom, height: height * zoom }}>
      <div
        className="pixel-output"
        role="img"
        aria-label="box-shadow 변환 결과"
        style={{ width, height, transform: `scale(${zoom})` }}
      >
        {buildPalette(prepared.logical, prepared.pixelSize).map((layer) => (
          <span
            key={layer.color}
            style={{
              width: prepared.pixelSize,
              height: prepared.pixelSize,
              color: layer.color,
              boxShadow: layer.coordinates.join(","),
            }}
          />
        ))}
      </div>
    </div>
  )
}

function HistoryThumbnail({ blob }: { blob: Blob }) {
  const [url, setURL] = useState("")

  useEffect(() => {
    const next = URL.createObjectURL(blob)
    setURL(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])

  return url ? <img src={url} alt="" /> : null
}

export default function App() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [settings, setSettings] = useState(defaultSettings)
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [background, setBackground] = useState("checker")
  const [zoom, setZoom] = useState(1)
  const [toast, setToast] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  const toastTimer = useRef(0)
  const itemsRef = useRef<QueueItem[]>([])

  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const prepared = useMemo(() => selected ? prepareItem(selected, settings) : null, [selected, settings])

  useEffect(() => {
    listHistory().then(setHistory).catch(() => showToast("저장 기록을 불러오지 못했습니다."))
  }, [])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewURL)), [])

  useEffect(() => {
    if (!selected) return
    const timer = window.setTimeout(() => {
      const now = Date.now()
      const existing = history.find((record) => record.id === selected.historyId)
      const record: HistoryRecord = {
        id: selected.historyId,
        name: selected.file.name,
        blob: selected.file,
        width: selected.image.width,
        height: selected.image.height,
        colors: selected.analysis.colors,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        settings: {
          autoScale: settings.autoScale,
          preserveDimensions: settings.preserveDimensions,
          customPixelSize: settings.customPixelSize,
          format: settings.format,
        },
      }
      saveHistory(record).then(() => {
        setHistory((current) => [record, ...current.filter((item) => item.id !== record.id)])
      }).catch(() => showToast("현재 작업을 기록하지 못했습니다."))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [selected, settings.autoScale, settings.preserveDimensions, settings.customPixelSize, settings.format])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type === "image/png")
      if (files.length) void addFiles(files)
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  })

  function showToast(message: string) {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(""), 2400)
  }

  async function addFiles(input: File[], restore?: HistoryRecord) {
    const files = input.filter(isPNG)
    if (!files.length) {
      showToast("PNG 파일만 불러올 수 있습니다.")
      return
    }

    const settled = await Promise.allSettled(
      files.map(async (file, index): Promise<QueueItem> => {
        const image = await decodePNG(file)
        return {
          id: crypto.randomUUID(),
          historyId: restore && index === 0 ? restore.id : crypto.randomUUID(),
          file,
          image,
          analysis: analyzeImageData(image),
          previewURL: URL.createObjectURL(file),
        }
      }),
    )
    const decoded = settled
      .filter((result): result is PromiseFulfilledResult<QueueItem> => result.status === "fulfilled")
      .map((result) => result.value)
    const failed = settled.length - decoded.length
    if (!decoded.length) {
      showToast("PNG를 정확히 디코딩하지 못했습니다.")
      return
    }
    const now = Date.now()
    const records: HistoryRecord[] = decoded.map((item, index) => ({
      id: item.historyId,
      name: item.file.name,
      blob: item.file,
      width: item.image.width,
      height: item.image.height,
      colors: item.analysis.colors,
      createdAt: restore && index === 0 ? restore.createdAt : now + index,
      updatedAt: now + index,
      settings: restore && index === 0 ? restore.settings : {
        autoScale: settings.autoScale,
        preserveDimensions: settings.preserveDimensions,
        customPixelSize: settings.customPixelSize,
        format: settings.format,
      },
    }))
    Promise.all(records.map(saveHistory)).then(() => {
      setHistory((current) => [[...records].reverse(), current.filter((record) => !records.some((added) => added.id === record.id))].flat())
    }).catch(() => showToast("이미지는 추가했지만 저장 기록을 갱신하지 못했습니다."))
    setItems((current) => [...current, ...decoded])
    setSelectedId(decoded[0].id)
    if (restore) {
      setSettings((current) => ({
        ...current,
        autoScale: restore.settings.autoScale,
        preserveDimensions: restore.settings.preserveDimensions,
        customPixelSize: restore.settings.customPixelSize,
        format: restore.settings.format,
      }))
    }
    showToast(failed ? `${decoded.length}개 추가 · ${failed}개 제외` : `${decoded.length}개 PNG를 변환 큐에 추가했습니다.`)
  }

  function removeItem(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.previewURL)
      const next = current.filter((item) => item.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.id ?? "")
      return next
    })
  }

  function clearQueue() {
    items.forEach((item) => URL.revokeObjectURL(item.previewURL))
    setItems([])
    setSelectedId("")
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    void addFiles([...event.target.files ?? []])
    event.target.value = ""
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDragging(false)
    void addFiles([...event.dataTransfer.files])
  }

  async function copyCurrent() {
    if (!prepared) return
    await navigator.clipboard.writeText(prepared.output.code)
    showToast(`${prepared.output.label} 코드를 복사했습니다.`)
  }

  function downloadCurrent() {
    if (!prepared) return
    downloadBlob(
      new Blob([prepared.output.code], { type: "text/plain;charset=utf-8" }),
      `${baseName(prepared.item.file.name)}-box-shadow.${prepared.output.extension}`,
    )
  }

  function downloadBatch() {
    if (!items.length) return
    const archive = createBatchArchive(items.map((item) => {
      const result = prepareItem(item, settings).output
      return { name: item.file.name, extension: result.extension, code: result.code }
    }), settings.format)
    downloadBlob(new Blob([archive], { type: "application/zip" }), "pixel-transformer-batch.zip")
    showToast(`${items.length}개 결과를 ZIP으로 저장했습니다.`)
  }

  async function reopenHistory(record: HistoryRecord) {
    const file = new File([record.blob], record.name, { type: "image/png" })
    await addFiles([file], record)
    setHistoryOpen(false)
  }

  async function removeHistory(id: string) {
    await deleteHistory(id)
    setHistory((current) => current.filter((record) => record.id !== id))
  }

  async function removeAllHistory() {
    await clearHistory()
    setHistory([])
    showToast("로컬 저장 기록을 비웠습니다.")
  }

  const limitRemaining = prepared && settings.codeLimit ? settings.codeLimit - prepared.output.code.length : null

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Pixel Transformer</h1>
            <p>lossless RGBA → box-shadow studio</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="local-badge"><LockKeyhole size={14} /> 로컬 처리</span>
          <button className="button secondary compact" type="button" onClick={() => setHistoryOpen(true)}>
            <Clock3 size={16} /> 기록 <b>{history.length}</b>
          </button>
          <button className="button primary compact" type="button" disabled={!items.length} onClick={downloadBatch}>
            <FileArchive size={16} /> {items.length > 1 ? `${items.length}개 ZIP` : "ZIP 저장"}
          </button>
        </div>
      </header>

      <main className="app-layout">
        <aside className="sidebar">
          <section className="sidebar-section">
            <div className="section-title"><span><b>01</b> 이미지 큐</span>{items.length > 0 && <button className="icon-action" type="button" title="큐 비우기" aria-label="큐 비우기" onClick={clearQueue}><RotateCcw size={17} /></button>}</div>
            <input ref={fileInput} className="visually-hidden" type="file" accept="image/png,.png" multiple onChange={handleFileInput} />
            <button
              className={`drop-zone ${dragging ? "dragging" : ""}`}
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <Upload size={25} />
              <span><strong>PNG 여러 장 가져오기</strong><small>선택 · 끌어놓기 · 붙여넣기</small></span>
            </button>

            {items.length > 0 && (
              <div className="queue-list" aria-label="변환 이미지 목록">
                {items.map((item, index) => (
                  <div
                    className={`queue-item ${item.id === selected?.id ? "selected" : ""}`}
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(item.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(item.id) }}
                  >
                    <img src={item.previewURL} alt="" />
                    <span className="queue-copy">
                      <strong>{item.file.name}</strong>
                      <small>{item.image.width}×{item.image.height} · {formatBytes(item.file.size)}</small>
                    </span>
                    <span className="queue-index">{String(index + 1).padStart(2, "0")}</span>
                    <button
                      className="queue-remove"
                      type="button"
                      aria-label={`${item.file.name} 제거`}
                      onClick={(event) => { event.stopPropagation(); removeItem(item.id) }}
                    ><X size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="sidebar-section">
            <div className="section-title"><span><b>02</b> 무손실 설정</span><span className="section-state">{prepared ? "RGBA 보존" : "대기"}</span></div>
            <label className="setting-row">
              <span><strong>반복 픽셀 자동 감지</strong><small>동일한 블록만 접습니다.</small></span>
              <input className="toggle" type="checkbox" checked={settings.autoScale} onChange={(event) => setSettings({ ...settings, autoScale: event.target.checked })} />
            </label>
            <label className="setting-row">
              <span><strong>원본 표시 크기 유지</strong><small>감지 배율을 CSS 픽셀에 적용합니다.</small></span>
              <input className="toggle" type="checkbox" checked={settings.preserveDimensions} onChange={(event) => setSettings({ ...settings, preserveDimensions: event.target.checked })} />
            </label>
            <label className={`range-field ${settings.preserveDimensions ? "disabled" : ""}`}>
              <span><strong>출력 픽셀 크기</strong><output>{settings.preserveDimensions ? `${prepared?.factor ?? 1}px` : `${settings.customPixelSize}px`}</output></span>
              <input type="range" min="1" max="32" value={settings.customPixelSize} disabled={settings.preserveDimensions} onChange={(event) => setSettings({ ...settings, customPixelSize: Number(event.target.value) })} />
            </label>
          </section>

          <section className="sidebar-section">
            <div className="section-title"><span><b>03</b> 출력 방식</span></div>
            <label className="select-field">
              <span>형식</span>
              <select value={settings.format} onChange={(event) => setSettings({ ...settings, format: event.target.value as OutputFormat })}>
                {outputFormats.map((format) => <option key={format} value={format}>{outputLabels[format]}</option>)}
              </select>
            </label>
            <label className="select-field">
              <span>코드 길이 제한</span>
              <select value={settings.codeLimit} onChange={(event) => setSettings({ ...settings, codeLimit: Number(event.target.value) })}>
                <option value={8000}>8,000자</option>
                <option value={32000}>32,000자</option>
                <option value={65535}>65,535자</option>
                <option value={1000000}>1,000,000자</option>
                <option value={0}>제한 없음</option>
              </select>
            </label>
            <div className={`limit-meter ${limitRemaining !== null && limitRemaining < 0 ? "over" : ""}`}>
              <span>{!prepared ? "이미지를 불러오세요." : limitRemaining === null ? "제한 없이 출력합니다." : limitRemaining >= 0 ? `${limitRemaining.toLocaleString("ko-KR")}자 여유` : `${Math.abs(limitRemaining).toLocaleString("ko-KR")}자 초과`}</span>
              {prepared && settings.codeLimit > 0 && <i style={{ width: `${Math.min(100, prepared.output.code.length / settings.codeLimit * 100)}%` }} />}
            </div>
          </section>
        </aside>

        <section className="workspace">
          <header className="workspace-head">
            <div>
              <p className="eyebrow">ORIGINAL / GENERATED</p>
              <h2>{selected?.file.name ?? "PNG를 선택하세요"}</h2>
            </div>
            {prepared && (
              <div className="metric-strip">
                <span><small>논리 크기</small><strong>{prepared.logical.width}×{prepared.logical.height}</strong></span>
                <span><small>감지 배율</small><strong>{selected.analysis.detectedScale}×</strong></span>
                <span><small>색상</small><strong>{selected.analysis.colors.toLocaleString("ko-KR")}</strong></span>
                <span><small>PIXEL DIFF</small><strong className="exact">{prepared.mismatch}</strong></span>
              </div>
            )}
          </header>

          {!prepared ? (
            <button className="workspace-empty" type="button" onClick={() => fileInput.current?.click()}>
              <span className="empty-pixel" aria-hidden="true" />
              <strong>첫 PNG를 가져오세요</strong>
              <small>여러 파일을 한 번에 선택할 수 있습니다.</small>
              <span className="button primary"><ImagePlus size={17} /> 파일 선택</span>
            </button>
          ) : (
            <>
              <div className="preview-grid">
                <section className="preview-pane">
                  <header><span>PNG SOURCE</span><small>{selected.image.width} × {selected.image.height}px</small></header>
                  <div className="preview-stage" data-background={background}><SourcePreview image={selected.image} zoom={zoom} /></div>
                </section>
                <section className="preview-pane">
                  <header><span>BOX-SHADOW</span><small>{prepared.logical.width * prepared.pixelSize} × {prepared.logical.height * prepared.pixelSize}px</small></header>
                  <div className="preview-stage" data-background={background}><CSSPreview prepared={prepared} zoom={zoom} /></div>
                </section>
              </div>

              <div className="preview-toolbar">
                <div className="toolbar-set">
                  <span>배경 검사</span>
                  {[
                    ["checker", "투명 격자"],
                    ["light", "흰색"],
                    ["dark", "어두운 색"],
                  ].map(([value, label]) => <button key={value} className={`swatch ${value}`} type="button" aria-label={label} title={label} aria-pressed={background === value} onClick={() => setBackground(value)} />)}
                </div>
                <label className="zoom-control"><span>미리보기</span><input type="range" min="1" max="8" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><output>{zoom}×</output></label>
              </div>

              <section className="code-panel">
                <header>
                  <div><Code2 size={18} /><span><strong>{prepared.output.label}</strong><small>{prepared.output.code.length.toLocaleString("ko-KR")}자 · {prepared.output.language.toUpperCase()}</small></span></div>
                  <div className="code-actions">
                    <button className="button dark" type="button" onClick={downloadCurrent}><Download size={16} /> 파일</button>
                    <button className="button accent" type="button" onClick={() => void copyCurrent()}><Clipboard size={16} /> 복사</button>
                  </div>
                </header>
                <pre>{prepared.output.code}</pre>
              </section>
            </>
          )}
        </section>
      </main>

      <div className={`drawer-scrim ${historyOpen ? "open" : ""}`} onClick={() => setHistoryOpen(false)} />
      <aside className={`history-drawer ${historyOpen ? "open" : ""}`} aria-hidden={!historyOpen}>
        <header>
          <div><p className="eyebrow">LOCAL ARCHIVE</p><h2>저장 기록</h2></div>
          <button className="icon-action" type="button" title="닫기" aria-label="기록 닫기" onClick={() => setHistoryOpen(false)}><X /></button>
        </header>
        <div className="history-tools">
          <span>브라우저에 저장된 PNG {history.length}개</span>
          {history.length > 0 && <button type="button" onClick={() => void removeAllHistory()}><Trash2 size={14} /> 모두 지우기</button>}
        </div>
        <div className="history-list">
          {!history.length && <div className="history-empty"><Archive size={28} /><strong>아직 저장된 작업이 없습니다.</strong></div>}
          {history.map((record) => (
            <article className="history-item" key={record.id}>
              <button className="history-open" type="button" onClick={() => void reopenHistory(record)}>
                <span className="history-thumb"><HistoryThumbnail blob={record.blob} /></span>
                <span><strong>{record.name}</strong><small>{record.width}×{record.height} · {record.colors}색</small><time>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(record.updatedAt)}</time></span>
                <ChevronRight size={18} />
              </button>
              <button className="history-delete" type="button" title="기록 삭제" aria-label={`${record.name} 기록 삭제`} onClick={() => void removeHistory(record.id)}><Trash2 size={15} /></button>
            </article>
          ))}
        </div>
      </aside>

      <div className={`toast ${toast ? "visible" : ""}`} role="status"><Check size={16} /> {toast}</div>
    </div>
  )
}
