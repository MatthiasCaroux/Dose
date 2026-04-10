import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEntriesForDate, deleteEntry, updateEntry, getTodayStr } from '../db'

export default function History() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(getTodayStr())
  const [entries, setEntries] = useState([])
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editKcal, setEditKcal] = useState('')
  const [editPortion, setEditPortion] = useState('')

  useEffect(() => {
    loadForDate(selectedDate)
  }, [selectedDate])

  const loadForDate = async (date) => {
    const dayEntries = await getEntriesForDate(date)
    setEntries(dayEntries.sort((a, b) => a.time.localeCompare(b.time)))
  }

  const handleDelete = async (id) => {
    await deleteEntry(id)
    setDeleteConfirm(null)
    if (editingId === id) {
      setEditingId(null)
      setEditKcal('')
      setEditPortion('')
    }
    loadForDate(selectedDate)
  }

  const startEdit = (entry) => {
    setDeleteConfirm(null)
    setEditingId(entry.id)
    setEditKcal(String(entry.kcal ?? ''))
    if (entry.kcalPer100g) {
      const basePortion = entry.defaultPortion
        || (entry.kcal ? Math.round((entry.kcal * 100) / entry.kcalPer100g) : 100)
      setEditPortion(String(basePortion))
    } else {
      setEditPortion('')
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditKcal('')
    setEditPortion('')
  }

  const onPortionChange = (value, entry) => {
    setEditPortion(value)
    const grams = parseFloat(value)
    if (!entry.kcalPer100g || !Number.isFinite(grams) || grams <= 0) return
    setEditKcal(String(Math.round((entry.kcalPer100g * grams) / 100)))
  }

  const saveEdit = async (entry) => {
    const kcal = parseInt(editKcal, 10)
    if (!Number.isFinite(kcal) || kcal < 0) return
    const updates = { kcal }
    if (entry.kcalPer100g && editPortion) {
      const grams = parseFloat(editPortion)
      if (Number.isFinite(grams) && grams > 0) {
        updates.defaultPortion = grams
      }
    }
    await updateEntry(entry.id, updates)
    cancelEdit()
    loadForDate(selectedDate)
  }

  const shiftDay = (delta) => {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().slice(0, 10))
    setDeleteConfirm(null)
    cancelEdit()
  }

  const formatDate = (str) => {
    const d = new Date(str + 'T00:00:00')
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const totalForDate = entries.reduce((sum, e) => sum + e.kcal, 0)

  return (
    <div className="page history-page">
      <h2 style={{ marginBottom: 24 }}>Historique</h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '44px 1fr 44px',
        gap: 8,
        alignItems: 'center',
        marginBottom: 12
      }}>
        <button onClick={() => shiftDay(-1)} style={{ minWidth: 'unset', minHeight: 40 }}>←</button>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ textAlign: 'center', marginBottom: 0 }}
        />
        <button onClick={() => shiftDay(1)} style={{ minWidth: 'unset', minHeight: 40 }}>→</button>
      </div>

      <button
        className="btn btn-ghost btn-full"
        onClick={() => navigate(`/add?date=${selectedDate}`)}
        style={{ marginBottom: 20 }}
      >
        Ajouter pour ce jour
      </button>

      <div className="fade-in" key={selectedDate}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {formatDate(selectedDate)}
          </p>
          <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {totalForDate} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>kcal</span>
          </p>
        </div>

        {entries.length === 0 ? (
          <p className="empty-state">Aucune entrée ce jour</p>
        ) : (
          <div className="entry-list">
            {entries.map(entry => (
              <div
                key={entry.id}
                className={`entry-item ${deleteConfirm === entry.id ? 'show-delete' : ''}`}
                style={{ display: 'block' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div className="entry-info">
                    <div className="entry-label">{entry.label}</div>
                    <div className="entry-meta">{entry.time}</div>
                  </div>
                  <div className="entry-kcal">{entry.kcal} kcal</div>
                </div>

                {editingId === entry.id ? (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: entry.kcalPer100g ? '1fr 1fr' : '1fr', gap: 8 }}>
                      <input
                        type="number"
                        min="0"
                        value={editKcal}
                        onChange={e => setEditKcal(e.target.value)}
                        placeholder="Calories"
                        style={{ marginBottom: 0, textAlign: 'center' }}
                      />
                      {entry.kcalPer100g && (
                        <input
                          type="number"
                          min="1"
                          max="2000"
                          value={editPortion}
                          onChange={e => onPortionChange(e.target.value, entry)}
                          placeholder="Portion (g)"
                          style={{ marginBottom: 0, textAlign: 'center' }}
                        />
                      )}
                    </div>
                    {entry.kcalPer100g && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.76rem', textAlign: 'center' }}>
                        {entry.kcalPer100g} kcal / 100g
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary" onClick={() => saveEdit(entry)} style={{ flex: 1 }}>Enregistrer</button>
                      <button className="btn btn-ghost" onClick={cancelEdit} style={{ flex: 1 }}>Annuler</button>
                    </div>
                  </div>
                ) : deleteConfirm === entry.id ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      style={{
                        flex: 1,
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
                        flex: 1,
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
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button className="btn btn-ghost" onClick={() => startEdit(entry)} style={{ flex: 1 }}>Modifier</button>
                    <button className="entry-delete" onClick={() => setDeleteConfirm(entry.id)} style={{ minWidth: 44 }}>✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
