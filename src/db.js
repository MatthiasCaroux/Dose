import { openDB } from 'idb'

const DB_NAME = 'dose-db'
const DB_VERSION = 1

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Entries store
        if (!db.objectStoreNames.contains('entries')) {
          const entriesStore = db.createObjectStore('entries', {
            keyPath: 'id',
            autoIncrement: true
          })
          entriesStore.createIndex('date', 'date', { unique: false })
        }

        // Favorites store
        if (!db.objectStoreNames.contains('favorites')) {
          const favStore = db.createObjectStore('favorites', {
            keyPath: 'id',
            autoIncrement: true
          })
          favStore.createIndex('label', 'label', { unique: false })
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' })
        }

        // Food usage count (for auto-favorite)
        if (!db.objectStoreNames.contains('foodUsage')) {
          const usageStore = db.createObjectStore('foodUsage', { keyPath: 'label' })
          usageStore.createIndex('count', 'count', { unique: false })
        }
      }
    })
  }
  return dbPromise
}

// ─── Entries ──────────────────────────────────────────────────────────────────

export async function addEntry(entry) {
  const db = await getDB()
  const id = await db.add('entries', {
    ...entry,
    date: entry.date || getTodayStr(),
    time: entry.time || getCurrentTimeStr()
  })
  // Track usage for auto-favorite
  if (entry.label) {
    await incrementUsage(entry.label, entry.kcalPer100g, entry.defaultPortion, {
      fatPer100g: entry.fatPer100g,
      carbsPer100g: entry.carbsPer100g,
      proteinPer100g: entry.proteinPer100g
    })
  }
  return id
}

export async function getEntriesForDate(date) {
  const db = await getDB()
  const index = db.transaction('entries').store.index('date')
  return index.getAll(date)
}

export async function deleteEntry(id) {
  const db = await getDB()
  await db.delete('entries', id)
}

export async function updateEntry(id, updates) {
  const db = await getDB()
  const current = await db.get('entries', id)
  if (!current) return null
  const next = { ...current, ...updates, id }
  await db.put('entries', next)
  return next
}

export async function getAllEntries() {
  const db = await getDB()
  return db.getAll('entries')
}

// ─── Favorites ────────────────────────────────────────────────────────────────

export async function getFavorites() {
  const db = await getDB()
  return db.getAll('favorites')
}

export async function addFavorite(fav) {
  const db = await getDB()
  return db.add('favorites', fav)
}

export async function deleteFavorite(id) {
  const db = await getDB()
  return db.delete('favorites', id)
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(key, defaultValue) {
  const db = await getDB()
  const record = await db.get('settings', key)
  return record ? record.value : defaultValue
}

export async function setSetting(key, value) {
  const db = await getDB()
  return db.put('settings', { key, value })
}

export async function getAllSettings() {
  const db = await getDB()
  const all = await db.getAll('settings')
  const result = {}
  for (const record of all) result[record.key] = record.value
  return result
}

// ─── Auto-favorite logic ───────────────────────────────────────────────────────

async function incrementUsage(label, kcalPer100g, defaultPortion, macros = {}) {
  const db = await getDB()
  const tx = db.transaction(['foodUsage', 'favorites'], 'readwrite')
  const usageStore = tx.objectStore('foodUsage')
  const favStore = tx.objectStore('favorites')

  const existing = await usageStore.get(label)
  const count = existing ? existing.count + 1 : 1
  await usageStore.put({
    label,
    count,
    kcalPer100g,
    defaultPortion,
    fatPer100g: macros.fatPer100g,
    carbsPer100g: macros.carbsPer100g,
    proteinPer100g: macros.proteinPer100g
  })

  if (count === 3) {
    // Auto-add to favorites
    const favIndex = favStore.index('label')
    const alreadyFav = await favIndex.get(label)
    if (!alreadyFav) {
      await favStore.add({
        label,
        kcalPer100g: kcalPer100g || null,
        defaultPortion: defaultPortion || 100,
        fatPer100g: macros.fatPer100g || null,
        carbsPer100g: macros.carbsPer100g || null,
        proteinPer100g: macros.proteinPer100g || null
      })
    }
  }
  await tx.done
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export async function exportData() {
  const db = await getDB()
  const [entries, favorites, settings, foodUsage] = await Promise.all([
    db.getAll('entries'),
    db.getAll('favorites'),
    db.getAll('settings'),
    db.getAll('foodUsage')
  ])
  return { entries, favorites, settings, foodUsage, exportedAt: new Date().toISOString() }
}

export async function importData(data) {
  const db = await getDB()
  const tx = db.transaction(['entries', 'favorites', 'settings', 'foodUsage'], 'readwrite')

  // Clear all stores
  await Promise.all([
    tx.objectStore('entries').clear(),
    tx.objectStore('favorites').clear(),
    tx.objectStore('settings').clear(),
    tx.objectStore('foodUsage').clear()
  ])

  // Restore data
  for (const entry of data.entries || []) await tx.objectStore('entries').add(entry)
  for (const fav of data.favorites || []) await tx.objectStore('favorites').add(fav)
  for (const s of data.settings || []) await tx.objectStore('settings').put(s)
  for (const u of data.foodUsage || []) await tx.objectStore('foodUsage').put(u)

  await tx.done
}

export async function resetAllData() {
  const db = await getDB()
  const tx = db.transaction(['entries', 'favorites', 'settings', 'foodUsage'], 'readwrite')
  await Promise.all([
    tx.objectStore('entries').clear(),
    tx.objectStore('favorites').clear(),
    tx.objectStore('settings').clear(),
    tx.objectStore('foodUsage').clear()
  ])
  await tx.done
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTodayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function getCurrentTimeStr() {
  const now = new Date()
  return now.toTimeString().slice(0, 5)
}

export async function getDatesWithEntries() {
  const all = await getAllEntries()
  const dates = [...new Set(all.map(e => e.date))]
  return dates.sort().reverse()
}
