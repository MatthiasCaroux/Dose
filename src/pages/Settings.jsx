import { useState, useEffect } from 'react'
import { getSetting, setSetting, exportData, importData, resetAllData, getFavorites, deleteFavorite } from '../db'

export default function Settings() {
  const [dailyGoal, setDailyGoal] = useState(2000)
  const [comfortRange, setComfortRange] = useState(200)
  const [favorites, setFavorites] = useState([])
  const [saved, setSaved] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [importMsg, setImportMsg] = useState(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    const [goal, range, favs] = await Promise.all([
      getSetting('dailyGoal', 2000),
      getSetting('comfortRange', 200),
      getFavorites()
    ])
    setDailyGoal(goal)
    setComfortRange(range)
    setFavorites(favs)
  }

  const saveSettings = async () => {
    await Promise.all([
      setSetting('dailyGoal', dailyGoal),
      setSetting('comfortRange', comfortRange)
    ])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleExport = async () => {
    const data = await exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dose-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        await importData(data)
        setImportMsg('Données importées avec succès.')
        loadSettings()
      } catch {
        setImportMsg('Erreur : fichier invalide.')
      }
      setTimeout(() => setImportMsg(null), 3000)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleReset = async () => {
    await resetAllData()
    setResetConfirm(false)
    loadSettings()
  }

  const handleDeleteFavorite = async (id) => {
    await deleteFavorite(id)
    setFavorites(prev => prev.filter(f => f.id !== id))
  }

  return (
    <div className="page settings-page">
      <h2 style={{ marginBottom: 24 }}>Réglages</h2>

      {/* ── Dose Calculator ── */}
      <div style={{ marginBottom: 32 }}>
        <p className="section-title">OBJECTIF CALORIQUE</p>

        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.9rem' }}>Objectif quotidien</span>
            <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{dailyGoal} kcal</span>
          </div>
          <input
            type="range"
            min="1200"
            max="3500"
            step="50"
            value={dailyGoal}
            onChange={e => setDailyGoal(Number(e.target.value))}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>
            <span>1200</span>
            <span>3500</span>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.9rem' }}>Fourchette de confort</span>
            <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>± {comfortRange} kcal</span>
          </div>
          <input
            type="range"
            min="100"
            max="400"
            step="50"
            value={comfortRange}
            onChange={e => setComfortRange(Number(e.target.value))}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>
            <span>±100</span>
            <span>±400</span>
          </div>
        </div>

        {/* Zone preview */}
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title" style={{ marginBottom: 8 }}>APERÇU DE LA ZONE</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: 4 }}>MINIMUM</p>
              <p style={{ fontWeight: 600 }}>{dailyGoal - comfortRange}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: 4 }}>OBJECTIF</p>
              <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>{dailyGoal}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: 4 }}>MAXIMUM</p>
              <p style={{ fontWeight: 600 }}>{dailyGoal + comfortRange}</p>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary btn-full"
          onClick={saveSettings}
        >
          {saved ? '✓ Enregistré' : 'Enregistrer'}
        </button>
      </div>

      <div className="divider" />

      {/* ── Favorites ── */}
      {favorites.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <p className="section-title">FAVORIS ({favorites.length})</p>
          <div className="entry-list">
            {favorites.map(fav => (
              <div key={fav.id} className="entry-item show-delete">
                <div className="entry-info">
                  <div className="entry-label">{fav.label}</div>
                  {fav.kcalPer100g && (
                    <div className="entry-meta">{fav.kcalPer100g} kcal/100g</div>
                  )}
                </div>
                <button
                  className="entry-delete"
                  onClick={() => handleDeleteFavorite(fav.id)}
                  style={{ opacity: 1, minWidth: 'unset' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {favorites.length > 0 && <div className="divider" />}

      {/* ── Export / Import ── */}
      <div style={{ marginBottom: 32 }}>
        <p className="section-title">DONNÉES</p>

        <button
          className="btn btn-ghost btn-full"
          onClick={handleExport}
          style={{ marginBottom: 10 }}
        >
          ↓ Exporter mes données (.json)
        </button>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '12px 20px',
          background: 'var(--surface)',
          border: '1px solid var(--border-light)',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: '0.9rem',
          fontWeight: 500,
          minHeight: 48
        }}>
          ↑ Importer des données (.json)
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>

        {importMsg && (
          <p style={{
            marginTop: 10,
            fontSize: '0.85rem',
            color: importMsg.startsWith('Erreur') ? '#ff6b6b' : 'var(--text-muted)',
            textAlign: 'center'
          }}>
            {importMsg}
          </p>
        )}
      </div>

      <div className="divider" />

      {/* ── Reset ── */}
      <div style={{ marginBottom: 32 }}>
        <p className="section-title">ZONE DANGEREUSE</p>

        {!resetConfirm ? (
          <button
            className="btn btn-danger btn-full"
            onClick={() => setResetConfirm(true)}
          >
            Réinitialiser toutes les données
          </button>
        ) : (
          <div className="card" style={{ borderColor: '#3a0000' }}>
            <p style={{ fontSize: '0.9rem', marginBottom: 16, textAlign: 'center' }}>
              Toutes vos entrées et favoris seront supprimés. Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setResetConfirm(false)}
              >
                Annuler
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={handleReset}
              >
                Confirmer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── About ── */}
      <div style={{ textAlign: 'center', paddingBottom: 8 }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          Dose · Suivi calorique minimaliste
        </p>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>
          Données stockées localement · Aucun compte requis
        </p>
      </div>
    </div>
  )
}
