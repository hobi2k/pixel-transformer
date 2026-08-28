import type { OutputFormat } from "../core/exporters"

export type HistoryRecord = {
  id: string
  name: string
  blob: Blob
  width: number
  height: number
  colors: number
  createdAt: number
  updatedAt: number
  settings: {
    autoScale: boolean
    preserveDimensions: boolean
    customPixelSize: number
    format: OutputFormat
  }
}

const databaseName = "pixel-transformer"
const storeName = "history"

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const request = operation(database.transaction(storeName, mode).objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).finally(() => database.close())
}

export function listHistory() {
  return transaction("readonly", (store) => store.getAll()).then((records) =>
    (records as HistoryRecord[]).sort((first, second) => second.updatedAt - first.updatedAt),
  )
}

export function saveHistory(record: HistoryRecord) {
  return transaction("readwrite", (store) => store.put(record))
}

export function deleteHistory(id: string) {
  return transaction("readwrite", (store) => store.delete(id))
}

export function clearHistory() {
  return transaction("readwrite", (store) => store.clear())
}
