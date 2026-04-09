import { useState, useEffect } from 'react'
import { getAllEntries, deleteEntry, getDatesWithEntries } from '../db'

export default function History() {
  const [dates, setDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [entriesByDate, setEntriesByDate] = useState({})
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    const all = await getAllEntries()
    const byDate = {}
    for (const entry of all) {
      if (!byDate[entry.date]) byDate[entry.date] = []
      byDate[entry.date].push(entry)
    }
    // Sort entries within each date by time
    for (const date of Object.keys(byDate)) {
      byDate[date].sort((a, b) => a.time.localeCompare(b.time))
    }
    setEntriesByDate(byDate)
    const d = Object.keys(byDate).sort().reverse()
    setDates(d)
    if (d.length > 0 && !selectedDate) setSelectedDate(d[0])
  }

  const handleDelete = async (id) => {
    await deleteEntry(id)
    setDeleteConfirm(null)
    loadAll()
  }

  const formatDate = (str) => {
    const d = new Date(str + 'T00:00:00')
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const formatDateShort = (str) => {
    const d = new Date(str + 'T00:00:00')
    const day = d.toLocaleDateString('fr-FR', { weekday: 'short' })
    const num = d.getDate()
    return { day: day.charAt(0).toUpperCase() + day.slice(1, 3), num }
  }

  const totalForDate = (date) => {
    return (entriesByDate[date] || []).reduce((sum, e) => sum + e.kcal, 0)
  }

  return (
    <div className="page history-page">
      <h2 style={{ marginBottom: 24 }}>Historique</h2>

      {dates.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '2rem', marginBottom: 12 }}>○</p>
          <p>Aucun historique</p>
        </div>
      ) : (
        <>
          {/* Scrollable date list */}
          <div style={{
            display: 'flex',
            gap: 10,
            overflowX: 'auto',
            paddingBottom: 4,
            marginBottom: 20,
            scrollbarWidth: 'none'
          }}>
            {dates.map(date => {
              const { day, num } = formatDateShort(date)
              const isSelected = selectedDate === date
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  style={{
                    flexShrink: 0,
                    width: 54,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '10px 4px',
                    background: isSelected ? 'var(--text)' : 'var(--surface)',
                    color: isSelected ? 'var(--bg)' : 'var(--text)',
                    border: isSelected ? 'none' : '1px solid var(--border)',
                    borderRadius: 10,
                    minHeight: 'unset',
                    minWidth: 'unset',
                    transition: 'all 0.15s'
                  }}
                >
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em', opacity: isSelected ? 0.7 : 0.6 }}>
                    {day}
                  </span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{num}</span>
                  <span style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: isSelected ? 'var(--bg)' : 'var(--text-muted)'
                  }} />
                </button>
              )
            })}
          </div>

          {/* Selected day detail */}
          {selectedDate && (
            <div className="fade-in" key={selectedDate}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {formatDate(selectedDate)}
                </p>
                <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  {totalForDate(selectedDate)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>kcal</span>
                </p>
              </div>

              {(entriesByDate[selectedDate] || []).length === 0 ? (
                <p className="empty-state">Aucune entrée ce jour</p>
              ) : (
                <div className="entry-list">
                  {(entriesByDate[selectedDate] || []).map(entry => (
                    <div
                      key={entry.id}
                      className={`entry-item ${deleteConfirm === entry.id ? 'show-delete' : ''}`}
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
                            onClick={() => setDeleteConfirm(null)}
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
                          onClick={() => setDeleteConfirm(entry.id)}
                          style={{ minWidth: 'unset' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
