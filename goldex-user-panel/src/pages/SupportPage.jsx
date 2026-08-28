import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ticketApi } from '../services/api'
import { Spinner, Alert, Button, TextField, SelectField } from '../components/UI'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const STATUS_KEY = {
  OPEN: 'statusOpen',
  IN_PROGRESS: 'statusInProgress',
  WAITING_ON_CUSTOMER: 'statusWaiting',
  RESOLVED: 'statusResolved',
  CLOSED: 'statusClosed',
}

const STATUS_CLASSES = {
  OPEN: 'badge-warning',
  IN_PROGRESS: 'badge-info',
  WAITING_ON_CUSTOMER: 'badge-warning',
  RESOLVED: 'badge-success',
  CLOSED: 'badge-secondary',
}

const CATEGORY_KEYS = [
  { value: 'TRADING', label: 'catTrading' },
  { value: 'KYC', label: 'catKyc' },
  { value: 'WITHDRAWAL', label: 'catWithdrawal' },
  { value: 'DEPOSIT', label: 'catDeposit' },
  { value: 'ACCOUNT', label: 'catAccount' },
  { value: 'TECHNICAL', label: 'catTechnical' },
  { value: 'OTHER', label: 'catOther' },
]

const PRIORITY_KEYS = [
  { value: 'LOW', label: 'priorityLow' },
  { value: 'MEDIUM', label: 'priorityMedium' },
  { value: 'HIGH', label: 'priorityHigh' },
  { value: 'URGENT', label: 'priorityUrgent' },
]

function SupportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 24, height: 24 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="12" y1="9" x2="16" y2="9" /><line x1="12" y1="13" x2="14" y2="13" /><line x1="8" y1="9" x2="8.01" y2="9" /><line x1="8" y1="13" x2="8.01" y2="13" />
    </svg>
  )
}

export default function SupportPage() {
  const { t } = useTranslation()
  const [tickets, setTickets] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('list')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)

  const [form, setForm] = useState({ subject: '', description: '', category: 'OTHER', priority: 'MEDIUM' })
  const [creating, setCreating] = useState(false)

  const statusLabel = (s) => t(`support.${STATUS_KEY[s] || 'statusOpen'}`)
  const categoryOptions = CATEGORY_KEYS.map((c) => ({ value: c.value, label: t(`support.${c.label}`) }))
  const priorityOptions = PRIORITY_KEYS.map((c) => ({ value: c.value, label: t(`support.${c.label}`) }))

  const loadTickets = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await ticketApi.getMyTickets(1, 50)
      setTickets(data.data || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err?.response?.data?.message || t('support.failedLoadTickets'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadTickets() }, [loadTickets])

  const loadTicketDetail = async (id) => {
    setLoading(true)
    try {
      const data = await ticketApi.getById(id)
      setSelectedTicket(data)
      setMessages(data.messages || [])
      setView('detail')
    } catch (err) {
      setError(err?.response?.data?.message || t('support.failedLoadTicket'))
    } finally {
      setLoading(false)
    }
  }

  const createTicket = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await ticketApi.create(form)
      setView('list')
      loadTickets()
    } catch (err) {
      setError(err?.response?.data?.message || t('support.failedCreateTicket'))
    } finally {
      setCreating(false)
    }
  }

  const sendMessage = async () => {
    if (!newMsg.trim()) return
    setSendingMsg(true)
    try {
      const msg = await ticketApi.addMessage(selectedTicket.id, { message: newMsg })
      setMessages((prev) => [...prev, msg])
      setNewMsg('')
    } catch (err) {
      setError(err?.response?.data?.message || t('support.failedSendMessage'))
    } finally {
      setSendingMsg(false)
    }
  }

  const setSatisfaction = async (score) => {
    try {
      await ticketApi.setSatisfaction(selectedTicket.id, score)
      setSelectedTicket((prev) => ({ ...prev, satisfactionScore: score }))
    } catch { }
  }

  if (view === 'detail' && selectedTicket) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="btn ghost" onClick={() => setView('list')} style={{ padding: '0.25rem' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div>
              <h1 className="main-header-title">{selectedTicket.subject}</h1>
              <p className="main-header-sub">
                <span className={`badge ${STATUS_CLASSES[selectedTicket.status]}`}>{statusLabel(selectedTicket.status)}</span>
                {' '}{t('support.created')} {fmtDate(selectedTicket.createAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="main-body">
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title">{t('support.description')}</div>
            <div style={{ padding: '0.5rem 0', color: 'var(--text-secondary)' }}>{selectedTicket.description}</div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title">{t('support.messages')} ({messages.length})</div>
            {messages.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('support.noMessages')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
                {messages.filter((m) => !m.isInternal).map((m) => (
                  <div key={m.id} style={{
                    padding: '0.75rem 1rem',
                    background: m.senderType === 'ADMIN' ? 'var(--surface)' : 'transparent',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    alignSelf: m.senderType === 'USER' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                  }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                      {m.senderType === 'ADMIN' ? t('support.supportAgent') : t('support.you')} · {fmtDate(m.createAt)}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>{m.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">{t('support.addMessage')}</div>
            <textarea
              className="text-field"
              rows={3}
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              placeholder={t('support.typeMessage')}
              style={{ width: '100%', marginBottom: '0.75rem', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button loading={sendingMsg} onClick={sendMessage} disabled={!newMsg.trim()}>
                {t('support.send')}
              </Button>
            </div>
          </div>

          {selectedTicket.status === 'RESOLVED' && !selectedTicket.satisfactionScore && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-title">{t('support.rateExperience')}</div>
              <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0' }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} className="btn ghost" onClick={() => setSatisfaction(s)}>
                    {s} ★
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <SupportIcon />
          <div>
            <h1 className="main-header-title">{t('support.title')}</h1>
            <p className="main-header-sub">{t('support.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="main-body">
        {error && <Alert type="error">{error}</Alert>}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button className={`btn ${view === 'list' ? '' : 'ghost'}`} onClick={() => setView('list')}>
            {t('support.myTickets')} {total > 0 && `(${total})`}
          </button>
          <button className={`btn ${view === 'create' ? '' : 'ghost'}`} onClick={() => setView('create')}>
            {t('support.newTicket')}
          </button>
        </div>

        {view === 'create' && (
          <form className="card" onSubmit={createTicket}>
            <div className="card-title">{t('support.newSupportTicket')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <TextField
                label={t('support.subject')}
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                required
              />
              <div>
                <label className="field-label">{t('support.description')}</label>
                <textarea
                  className="text-field"
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  required
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <SelectField
                  label={t('support.category')}
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  options={categoryOptions}
                />
                <SelectField
                  label={t('support.priority')}
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  options={priorityOptions}
                />
              </div>
              <div className="btn-row">
                <Button type="submit" loading={creating}>{t('support.submitTicket')}</Button>
              </div>
            </div>
          </form>
        )}

        {view === 'list' && (
          loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
              <Spinner />
            </div>
          ) : tickets.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{t('support.noTickets')}</div>
              <Button onClick={() => setView('create')}>{t('support.createTicket')}</Button>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              {tickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => loadTicketDetail(t.id)}
                  style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--surface)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontWeight: 600 }}>{t.subject}</div>
                    <span className={`badge ${STATUS_CLASSES[t.status]}`}>{statusLabel(t.status)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>{t.category}</span>
                    <span>·</span>
                    <span>{fmtDate(t.createAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
