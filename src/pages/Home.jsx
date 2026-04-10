import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEntriesForDate, deleteEntry, getSetting, getTodayStr } from '../db'

export default function Home() {
  const [entries, setEntries] = useState([])
  const [dailyGoal, setDailyGoal] = useState(2000)
  const [comfortRange, setComfortRange] = useState(200)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [longPressId, setLongPressId] = useState(null)
  const navigate = useNavigate()
  const today = getTodayStr()

  const load = useCallback(async () => {
    const [e, goal, range] = await Promise.all([
      getEntriesForDate(today),
      getSetting('dailyGoal', 2000),
      getSetting('comfortRange', 200)
    ])
    setEntries(e.sort((a, b) => a.time.localeCompare(b.time)))
    setDailyGoal(goal)
    setComfortRange(range)
  }, [today])

  useEffect(() => {
    load()
    // Refresh when page becomes visible
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const totalKcal = entries.reduce((sum, e) => sum + e.kcal, 0)
  const totalFat = Math.round(entries.reduce((sum, e) => sum + (Number(e.fat) || 0), 0) * 10) / 10
  const totalCarbs = Math.round(entries.reduce((sum, e) => sum + (Number(e.carbs) || 0), 0) * 10) / 10
  const totalProtein = Math.round(entries.reduce((sum, e) => sum + (Number(e.protein) || 0), 0) * 10) / 10
  const macroTotal = totalFat + totalCarbs + totalProtein
  const fatRatio = macroTotal > 0 ? (totalFat / macroTotal) * 100 : 0
  const carbsRatio = macroTotal > 0 ? (totalCarbs / macroTotal) * 100 : 0
  const proteinRatio = macroTotal > 0 ? (totalProtein / macroTotal) * 100 : 0
  const remaining = dailyGoal - totalKcal
  const lowerBound = dailyGoal - comfortRange
  const upperBound = dailyGoal + comfortRange

  // Color transitions: white → grey as you approach/exceed limit (never red)
  const getRemainingColor = () => {
    const ratio = totalKcal / dailyGoal
    if (ratio < 0.7) return '#F5F5F5'
    if (ratio < 0.9) return '#CCCCCC'
    if (ratio < 1.0) return '#999999'
    return '#777777'
  }

  const handleDelete = async (id) => {
    await deleteEntry(id)
    setDeleteConfirm(null)
    setLongPressId(null)
    load()
  }

  let pressTimer = null

  const handlePressStart = (id) => {
    pressTimer = setTimeout(() => {
      setLongPressId(id)
    }, 500)
  }

  const handlePressEnd = () => {
    clearTimeout(pressTimer)
  }

  const formatDate = (str) => {
    const d = new Date(str + 'T00:00:00')
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  return (
    <div className="page home-page">
      {/* Header */}
      <div className="home-header">
        <p className="label-sm" style={{ marginBottom: 8 }}>
          {formatDate(today)}
        </p>
        <p className="label-sm" style={{ marginBottom: 4 }}>DOSE CONSOMMÉE</p>
        <h1 style={{ color: getRemainingColor(), transition: 'color 0.5s ease' }}>
          {totalKcal}
          <span style={{ fontSize: '1.5rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            kcal
          </span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
          {remaining >= 0 ? `${remaining} kcal restantes` : `+${Math.abs(remaining)} kcal au-delà de l'objectif`}
        </p>
      </div>

      {/* Zone de Confort */}
      <div className="comfort-zone" style={{ marginTop: 24, marginBottom: 8 }}>
        <p className="label-sm" style={{ marginBottom: 10 }}>ZONE DE CONFORT</p>
        <div className="comfort-bar">
          <div className="comfort-track">
            <div
              className="comfort-fill"
              style={{
                width: `${Math.min((totalKcal / upperBound) * 100, 100)}%`,
                background: totalKcal > upperBound ? '#555' : '#F5F5F5'
              }}
            />
            {/* Lower bound dotted line */}
            <div
              className="comfort-dotted"
              style={{ left: `${(lowerBound / upperBound) * 100}%` }}
            />
          </div>
          <div className="comfort-labels">
            <span>{lowerBound}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{totalKcal} kcal aujourd'hui</span>
            <span>{upperBound}</span>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div style={{ marginTop: 16, marginBottom: 10 }}>
        <p className="label-sm" style={{ marginBottom: 10 }}>VISUEL MACROS</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Lipides</span>
              <span>{totalFat} g</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--border)' }}>
              <div style={{ width: `${fatRatio}%`, height: '100%', borderRadius: 999, background: 'var(--text)' }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Glucides</span>
              <span>{totalCarbs} g</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--border)' }}>
              <div style={{ width: `${carbsRatio}%`, height: '100%', borderRadius: 999, background: 'var(--text-muted)' }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Protéines</span>
              <span>{totalProtein} g</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--border)' }}>
              <div style={{ width: `${proteinRatio}%`, height: '100%', borderRadius: 999, background: 'var(--surface-hover)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Entries list */}
      {entries.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '2rem', marginBottom: 12 }}>○</p>
          <p>Aucune entrée aujourd'hui</p>
          <p style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            Appuyez sur + pour commencer
          </p>
        </div>
      ) : (
        <div className="entry-list">
          {entries.map(entry => (
            <div
              key={entry.id}
              className={`entry-item ${longPressId === entry.id ? 'show-delete' : ''}`}
              onMouseDown={() => handlePressStart(entry.id)}
              onMouseUp={handlePressEnd}
              onTouchStart={() => handlePressStart(entry.id)}
              onTouchEnd={handlePressEnd}
            >
              <div className="entry-info">
                <div className="entry-label">{entry.label}</div>
                <div className="entry-meta">{entry.time}</div>
              </div>
              <div className="entry-kcal">{entry.kcal} kcal</div>
              {deleteConfirm === entry.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    style={{
                      background: '#3a0000',
                      color: '#ff6b6b',
                      border: '1px solid #5a0000',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      minHeight: 32,
                      minWidth: 'unset'
                    }}
                  >
                    Supprimer
                  </button>
                  <button
                    onClick={() => { setDeleteConfirm(null); setLongPressId(null) }}
                    style={{
                      background: 'var(--surface)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      minHeight: 32,
                      minWidth: 'unset'
                    }}
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  className="entry-delete"
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(entry.id); setLongPressId(entry.id) }}
                  style={{ minWidth: 'unset' }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Total */}
      {entries.length > 0 && (
        <div style={{
          marginTop: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          borderTop: '1px solid var(--border)',
          paddingTop: 12
        }}>
          <span>Total aujourd'hui</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{totalKcal} kcal</span>
        </div>
      )}

      {/* FAB */}
      <button
        className="fab"
        onClick={() => navigate('/add')}
        aria-label="Ajouter une entrée"
      >
        +
      </button>

      <style>{`
        .home-header {
          margin-bottom: 8px;
        }
        .comfort-bar {
          width: 100%;
        }
        .comfort-track {
          position: relative;
          height: 3px;
          background: var(--border-light);
          border-radius: 2px;
          overflow: visible;
          margin-bottom: 8px;
        }
        .comfort-fill {
          height: 100%;
          border-radius: 2px;
          background: var(--text);
          transition: width 0.4s ease, background 0.3s ease;
          max-width: 100%;
        }
        .comfort-dotted {
          position: absolute;
          top: -5px;
          width: 2px;
          height: 14px;
          background: repeating-linear-gradient(
            to bottom,
            var(--text-muted) 0px,
            var(--text-muted) 3px,
            transparent 3px,
            transparent 6px
          );
        }
        .comfort-labels {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.72rem;
          color: var(--text-muted);
        }
        .fab {
          position: fixed;
          bottom: calc(var(--nav-height) + var(--safe-bottom) + 20px);
          right: 24px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: var(--text);
          color: var(--bg);
          font-size: 1.8rem;
          font-weight: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(0,0,0,0.8);
          z-index: 100;
          transition: transform 0.15s, opacity 0.15s;
          min-height: unset;
          min-width: unset;
          line-height: 1;
          padding-bottom: 2px;
        }
        .fab:active {
          transform: scale(0.93);
          opacity: 0.85;
        }
      `}</style>
    </div>
  )
}
