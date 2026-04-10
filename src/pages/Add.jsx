import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addEntry, getFavorites, getTodayStr, getCurrentTimeStr } from '../db'
import BarcodeScanner from '../components/BarcodeScanner'

// ─── Open Food Facts search ────────────────────────────────────────────────────

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toOneDecimal(value) {
  const number = toNumber(value)
  return number === null ? null : Math.round(number * 10) / 10
}

async function searchOFF(query) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,nutriments,brands`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const data = await res.json()
  return (data.products || [])
    .filter(p => p.product_name && p.nutriments?.['energy-kcal_100g'])
    .map(p => ({
      label: p.product_name + (p.brands ? ` — ${p.brands.split(',')[0]}` : ''),
      kcalPer100g: Math.round(p.nutriments['energy-kcal_100g']),
      fatPer100g: toOneDecimal(p.nutriments?.fat_100g),
      carbsPer100g: toOneDecimal(p.nutriments?.carbohydrates_100g),
      proteinPer100g: toOneDecimal(p.nutriments?.proteins_100g)
    }))
}

async function fetchByBarcode(barcode) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const data = await res.json()
  if (data.status !== 1) return null
  const p = data.product
  const kcal = p.nutriments?.['energy-kcal_100g']
  if (!kcal) return null
  return {
    label: p.product_name || `Produit ${barcode}`,
    kcalPer100g: Math.round(kcal),
    fatPer100g: toOneDecimal(p.nutriments?.fat_100g),
    carbsPer100g: toOneDecimal(p.nutriments?.carbohydrates_100g),
    proteinPer100g: toOneDecimal(p.nutriments?.proteins_100g)
  }
}

// ─── Quick amounts ─────────────────────────────────────────────────────────────

const QUICK_ITEMS = [
  { label: 'Petit', kcal: 200 },
  { label: 'Moyen', kcal: 600 },
  { label: 'Gros', kcal: 1000 }
]

// ─── Main component ────────────────────────────────────────────────────────────

export default function Add() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedDate = searchParams.get('date')
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '') ? requestedDate : getTodayStr()
  const [tab, setTab] = useState('search') // 'search' | 'scan'
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [favorites, setFavorites] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null) // { label, kcalPer100g }
  const [portion, setPortion] = useState('100')
  const [quickKcal, setQuickKcal] = useState('')
  const [quickFat, setQuickFat] = useState('')
  const [quickCarbs, setQuickCarbs] = useState('')
  const [quickProtein, setQuickProtein] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [customDirectKcal, setCustomDirectKcal] = useState('')
  const [customKcalPer100g, setCustomKcalPer100g] = useState('')
  const [customPortion, setCustomPortion] = useState('100')
  const [scanError, setScanError] = useState(null)
  const [scanResult, setScanResult] = useState(null) // fetched product
  const [offline, setOffline] = useState(!navigator.onLine)
  const searchTimeout = useRef(null)

  useEffect(() => {
    getFavorites().then(setFavorites)
  }, [])

  useEffect(() => {
    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ── Search with debounce ──

  useEffect(() => {
    clearTimeout(searchTimeout.current)
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        if (!offline) {
          const results = await searchOFF(query)
          setSearchResults(results)
        }
      } catch {
        // Network error, show only favorites
      } finally {
        setSearching(false)
      }
    }, 500)
    return () => clearTimeout(searchTimeout.current)
  }, [query, offline])

  const handleBarcodeDetected = async (decodedText) => {
    if (offline) {
      setScanError('En attente de réseau...')
      return
    }
    try {
      const product = await fetchByBarcode(decodedText)
      if (product) {
        setScanResult(product)
        setSelected(product)
        setPortion('100')
      } else {
        setScanError('Produit non trouvé dans la base de données.')
      }
    } catch {
      setScanError('Erreur réseau. Réessayez.')
    }
  }

  // ── Add entry helpers ──

  const addQuick = async (item) => {
    await addEntry({
      label: item.label,
      kcal: item.kcal,
      fat: item.fat ?? null,
      carbs: item.carbs ?? null,
      protein: item.protein ?? null,
      source: 'quick',
      date: targetDate,
      time: getCurrentTimeStr()
    })
    navigate('/')
  }

  const addQuickCustom = async () => {
    const kcal = parseInt(quickKcal, 10)
    if (!Number.isFinite(kcal) || kcal < 0) return
    const fat = toNumber(quickFat)
    const carbs = toNumber(quickCarbs)
    const protein = toNumber(quickProtein)
    await addEntry({
      label: 'Ajout rapide',
      kcal,
      fat: fat !== null && fat >= 0 ? fat : null,
      carbs: carbs !== null && carbs >= 0 ? carbs : null,
      protein: protein !== null && protein >= 0 ? protein : null,
      source: 'quick',
      date: targetDate,
      time: getCurrentTimeStr()
    })
    navigate('/')
  }

  const addFromSelected = async () => {
    if (!selected) return
    const p = parseInt(portion) || 100
    const kcal = Math.round((selected.kcalPer100g * p) / 100)
    const fat = selected.fatPer100g !== null && selected.fatPer100g !== undefined
      ? Math.round(((selected.fatPer100g * p) / 100) * 10) / 10
      : null
    const carbs = selected.carbsPer100g !== null && selected.carbsPer100g !== undefined
      ? Math.round(((selected.carbsPer100g * p) / 100) * 10) / 10
      : null
    const protein = selected.proteinPer100g !== null && selected.proteinPer100g !== undefined
      ? Math.round(((selected.proteinPer100g * p) / 100) * 10) / 10
      : null
    await addEntry({
      label: selected.label,
      kcal,
      fat,
      carbs,
      protein,
      kcalPer100g: selected.kcalPer100g,
      fatPer100g: selected.fatPer100g,
      carbsPer100g: selected.carbsPer100g,
      proteinPer100g: selected.proteinPer100g,
      defaultPortion: p,
      source: scanResult ? 'scan' : 'favorite',
      date: targetDate,
      time: getCurrentTimeStr()
    })
    navigate('/')
  }

  const addManual = async () => {
    if (!customLabel.trim()) return
    const directKcal = parseFloat(customDirectKcal)
    const hasDirectKcal = Number.isFinite(directKcal) && directKcal >= 0

    if (hasDirectKcal) {
      await addEntry({
        label: customLabel.trim(),
        kcal: Math.round(directKcal),
        source: 'manual',
        date: targetDate,
        time: getCurrentTimeStr()
      })
      navigate('/')
      return
    }

    if (!customKcalPer100g || !customPortion) return
    const kcalPer100g = parseFloat(customKcalPer100g)
    const grams = parseFloat(customPortion)
    if (!Number.isFinite(kcalPer100g) || !Number.isFinite(grams) || grams <= 0 || kcalPer100g < 0) return
    const kcal = Math.round((kcalPer100g * grams) / 100)
    await addEntry({
      label: customLabel.trim(),
      kcal,
      kcalPer100g,
      defaultPortion: grams,
      source: 'manual',
      date: targetDate,
      time: getCurrentTimeStr()
    })
    navigate('/')
  }

  // ── Favorites filter ──

  const filteredFavorites = query.length >= 1
    ? favorites.filter(f => f.label.toLowerCase().includes(query.toLowerCase()))
    : favorites

  const computedKcal = selected && portion
    ? Math.round((selected.kcalPer100g * (parseInt(portion) || 0)) / 100)
    : null

  const computedFat = selected?.fatPer100g !== null && selected?.fatPer100g !== undefined && portion
    ? Math.round(((selected.fatPer100g * (parseInt(portion) || 0)) / 100) * 10) / 10
    : null
  const computedCarbs = selected?.carbsPer100g !== null && selected?.carbsPer100g !== undefined && portion
    ? Math.round(((selected.carbsPer100g * (parseInt(portion) || 0)) / 100) * 10) / 10
    : null
  const computedProtein = selected?.proteinPer100g !== null && selected?.proteinPer100g !== undefined && portion
    ? Math.round(((selected.proteinPer100g * (parseInt(portion) || 0)) / 100) * 10) / 10
    : null

  const computedManualKcal = customKcalPer100g && customPortion
    ? Math.round((parseFloat(customKcalPer100g) * (parseFloat(customPortion) || 0)) / 100)
    : null

  const hasValidDirectKcal = Number.isFinite(parseFloat(customDirectKcal)) && parseFloat(customDirectKcal) >= 0
  const hasValidRuleOfThree = Boolean(
    customKcalPer100g
    && customPortion
    && (parseFloat(customPortion) || 0) > 0
    && (parseFloat(customKcalPer100g) || 0) >= 0
  )

  return (
    <div className="page add-page slide-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none',
            color: 'var(--text-muted)',
            fontSize: '1.4rem',
            minWidth: 'unset',
            padding: 0
          }}
        >
          ←
        </button>
        <h2>Ajouter</h2>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 16 }}>
        Date d'ajout : {targetDate}
      </p>

      {/* ── Quick buttons ── */}
      <div style={{ marginBottom: 24 }}>
        <p className="section-title">RAPIDE</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {QUICK_ITEMS.map(item => (
            <button
              key={item.label}
              onClick={() => addQuick(item)}
              style={{
                flex: 1,
                background: 'var(--surface)',
                border: '1px solid var(--border-light)',
                borderRadius: 10,
                padding: '14px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                minHeight: 72,
                minWidth: 'unset',
                transition: 'background 0.15s'
              }}
              onTouchStart={e => e.currentTarget.style.background = 'var(--surface-hover)'}
              onTouchEnd={e => e.currentTarget.style.background = 'var(--surface)'}
            >
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.label}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.kcal} kcal</span>
            </button>
          ))}
        </div>
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <p className="section-title" style={{ marginBottom: 8 }}>AJOUT RAPIDE PERSONNALISÉ</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input
              type="number"
              placeholder="Calories"
              value={quickKcal}
              onChange={e => setQuickKcal(e.target.value)}
              min="0"
              style={{ marginBottom: 0, textAlign: 'center' }}
            />
            <input
              type="number"
              placeholder="Lipides (g)"
              value={quickFat}
              onChange={e => setQuickFat(e.target.value)}
              min="0"
              step="0.1"
              style={{ marginBottom: 0, textAlign: 'center' }}
            />
            <input
              type="number"
              placeholder="Glucides (g)"
              value={quickCarbs}
              onChange={e => setQuickCarbs(e.target.value)}
              min="0"
              step="0.1"
              style={{ marginBottom: 0, textAlign: 'center' }}
            />
            <input
              type="number"
              placeholder="Protéines (g)"
              value={quickProtein}
              onChange={e => setQuickProtein(e.target.value)}
              min="0"
              step="0.1"
              style={{ marginBottom: 0, textAlign: 'center' }}
            />
          </div>
          <button
            className="btn btn-ghost btn-full"
            onClick={addQuickCustom}
            disabled={!quickKcal || (parseInt(quickKcal, 10) < 0)}
          >
            Ajouter rapide personnalisé
          </button>
        </div>
      </div>

      <div className="divider" />

      {/* ── Tab bar: Search / Scan ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {['search', 'scan'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              background: tab === t ? 'var(--surface-hover)' : 'none',
              border: tab === t ? '1px solid var(--border-light)' : '1px solid transparent',
              borderRadius: 8,
              padding: '10px',
              fontSize: '0.85rem',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              minHeight: 'unset',
              minWidth: 'unset'
            }}
          >
            {t === 'search' ? '🔍 Recherche' : '📷 Scanner'}
          </button>
        ))}
      </div>

      {/* ── Search tab ── */}
      {tab === 'search' && (
        <div>
          <input
            type="search"
            placeholder="Nom d'un aliment..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null) }}
            style={{ marginBottom: 12 }}
            autoFocus
          />

          {offline && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 8 }}>
              ○ Hors ligne — seuls les favoris sont disponibles
            </p>
          )}

          {/* Favorites */}
          {filteredFavorites.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <p className="section-title">FAVORIS</p>
              {filteredFavorites.map(fav => (
                <button
                  key={fav.id}
                  onClick={() => { setSelected(fav); setPortion(String(fav.defaultPortion || 100)) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '12px 0',
                    borderBottom: '1px solid var(--border)',
                    borderRadius: 0,
                    background: selected?.label === fav.label ? 'var(--surface)' : 'none',
                    textAlign: 'left',
                    minHeight: 'unset',
                    minWidth: 'unset',
                    paddingLeft: selected?.label === fav.label ? 12 : 0,
                    transition: 'all 0.15s'
                  }}
                >
                  <span style={{ fontSize: '0.9rem' }}>{fav.label}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {fav.kcalPer100g} kcal/100g
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Online search results */}
          {query.length >= 2 && !offline && (
            <div style={{ marginBottom: 12 }}>
              {searching ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
                  Recherche...
                </p>
              ) : searchResults.length > 0 ? (
                <>
                  <p className="section-title">RÉSULTATS</p>
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelected(r); setPortion('100') }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '12px 0',
                        borderBottom: '1px solid var(--border)',
                        borderRadius: 0,
                        background: selected?.label === r.label ? 'var(--surface)' : 'none',
                        textAlign: 'left',
                        minHeight: 'unset',
                        minWidth: 'unset',
                        paddingLeft: selected?.label === r.label ? 12 : 0,
                        transition: 'all 0.15s'
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', flex: 1, marginRight: 8, lineHeight: 1.3 }}>
                        {r.label}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {r.kcalPer100g} kcal/100g
                      </span>
                    </button>
                  ))}
                </>
              ) : query.length >= 2 && !searching ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>
                  Aucun résultat
                </p>
              ) : null}
            </div>
          )}

          {/* Portion + Add */}
          {selected && (
            <div className="card fade-in" style={{ marginTop: 16 }}>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>{selected.label}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <p className="section-title" style={{ marginBottom: 6 }}>PORTION (g)</p>
                  <input
                    type="number"
                    value={portion}
                    onChange={e => setPortion(e.target.value)}
                    min="1"
                    max="2000"
                    style={{ textAlign: 'center' }}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p className="section-title" style={{ marginBottom: 6 }}>TOTAL</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {computedKcal ?? '—'}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>kcal</p>
                </div>
              </div>
              {(computedFat !== null || computedCarbs !== null || computedProtein !== null) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                    <p className="section-title" style={{ marginBottom: 4 }}>LIPIDES</p>
                    <p style={{ fontWeight: 600 }}>{computedFat ?? '—'} g</p>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                    <p className="section-title" style={{ marginBottom: 4 }}>GLUCIDES</p>
                    <p style={{ fontWeight: 600 }}>{computedCarbs ?? '—'} g</p>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                    <p className="section-title" style={{ marginBottom: 4 }}>PROTÉINES</p>
                    <p style={{ fontWeight: 600 }}>{computedProtein ?? '—'} g</p>
                  </div>
                </div>
              )}
              <button
                className="btn btn-primary btn-full"
                onClick={addFromSelected}
                disabled={!portion || parseInt(portion) <= 0}
              >
                Ajouter
              </button>
            </div>
          )}

          <div className="divider" style={{ marginTop: 24 }} />

          {/* Manual entry */}
          <div>
            <p className="section-title">ENTRÉE MANUELLE</p>
            <input
              type="text"
              placeholder="Nom de l'aliment"
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <input
              type="number"
              placeholder="Calories directes (ex: 150)"
              value={customDirectKcal}
              onChange={e => setCustomDirectKcal(e.target.value)}
              min="0"
              style={{ marginBottom: 8, textAlign: 'center' }}
            />
            <p style={{
              color: 'var(--text-muted)',
              fontSize: '0.76rem',
              marginBottom: 8,
              textAlign: 'center'
            }}>
              Ou utiliser la règle de 3
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="number"
                placeholder="kcal / 100g"
                value={customKcalPer100g}
                onChange={e => setCustomKcalPer100g(e.target.value)}
                min="0"
                style={{ marginBottom: 0, textAlign: 'center' }}
              />
              <input
                type="number"
                placeholder="Portion (g)"
                value={customPortion}
                onChange={e => setCustomPortion(e.target.value)}
                min="1"
                max="2000"
                style={{ marginBottom: 0, textAlign: 'center' }}
              />
            </div>
            <p style={{
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              marginBottom: 12,
              textAlign: 'center'
            }}>
              Total calculé: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{computedManualKcal ?? '—'} kcal</span>
            </p>
            <button
              className="btn btn-ghost btn-full"
              onClick={addManual}
              disabled={!customLabel.trim() || (!hasValidDirectKcal && !hasValidRuleOfThree)}
            >
              Ajouter manuellement
            </button>
          </div>
        </div>
      )}

      {/* ── Scan tab ── */}
      {tab === 'scan' && (
        <div>
          {offline && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-light)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
              textAlign: 'center'
            }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                En attente de réseau...
              </p>
            </div>
          )}

          {!scanResult && (
            !scanError && <BarcodeScanner onDetected={handleBarcodeDetected} />
          )}

          {scanError && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.9rem' }}>
                {scanError}
              </p>
              <button className="btn btn-ghost" onClick={() => { setScanError(null); setScanResult(null) }}>
                Réessayer
              </button>
            </div>
          )}

          {scanResult && selected && (
            <div className="card fade-in">
              <p className="section-title" style={{ marginBottom: 8 }}>PRODUIT SCANNÉ</p>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16 }}>
                {selected.label}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <p className="section-title" style={{ marginBottom: 6 }}>PORTION (g)</p>
                  <input
                    type="number"
                    value={portion}
                    onChange={e => setPortion(e.target.value)}
                    min="1"
                    max="2000"
                    style={{ textAlign: 'center' }}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p className="section-title" style={{ marginBottom: 6 }}>TOTAL</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {computedKcal ?? '—'}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>kcal</p>
                </div>
              </div>
              {(computedFat !== null || computedCarbs !== null || computedProtein !== null) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                    <p className="section-title" style={{ marginBottom: 4 }}>LIPIDES</p>
                    <p style={{ fontWeight: 600 }}>{computedFat ?? '—'} g</p>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                    <p className="section-title" style={{ marginBottom: 4 }}>GLUCIDES</p>
                    <p style={{ fontWeight: 600 }}>{computedCarbs ?? '—'} g</p>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                    <p className="section-title" style={{ marginBottom: 4 }}>PROTÉINES</p>
                    <p style={{ fontWeight: 600 }}>{computedProtein ?? '—'} g</p>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => { setScanResult(null); setSelected(null); setScanError(null) }}
                  style={{ flex: 1 }}
                >
                  Rescanner
                </button>
                <button
                  className="btn btn-primary"
                  onClick={addFromSelected}
                  style={{ flex: 1 }}
                  disabled={!portion || parseInt(portion) <= 0}
                >
                  Ajouter
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
