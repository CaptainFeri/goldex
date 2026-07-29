import { useEffect, useState, useCallback } from 'react'
import { ticketApi } from '../services/api'
import { Spinner, Alert, Button, TextField, SelectField } from '../components/UI'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const STATUS_LABELS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_ON_CUSTOMER: 'Waiting on You',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}

const STATUS_CLASSES = {
  OPEN: 'badge-warning',
  IN_PROGRESS: 'badge-info',
  WAITING_ON_CUSTOMER: 'badge-warning',
  RESOLVED: 'badge-success',
  CLOSED: 'badge-secondary',
}

const CATEGORY_OPTIONS = [
  { value: 'TRADING', label: 'Trading' },
  { value: 'KYC', label: 'KYC' },
  { value: 'WITHDRAWAL', label: 'Withdrawal' },
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'ACCOUNT', label: 'Account' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'OTHER', label: 'Other' },
]

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
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

  const loadTickets = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await ticketApi.getMyTickets(1, 50)
      setTickets(data.data || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTickets() }, [loadTickets])

  const loadTicketDetail = async (id) => {
    setLoading(true)
    try {
      const data = await ticketApi.getById(id)
      setSelectedTicket(data)
      setMessages(data.messages || [])
      setView('detail')
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load ticket')
    } finally {
      setLoading(false)
    }
  }

  const createTicket = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      const ticket = await ticketApi.create(form)
      setView('list')
      loadTickets()
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create ticket')
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
      setError(err?.response?.data?.message || 'Failed to send message')
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
                <span className={`badge ${STATUS_CLASSES[selectedTicket.status]}`}>{STATUS_LABELS[selectedTicket.status]}</span>
                {' '}Created {fmtDate(selectedTicket.createAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="main-body">
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title">Description</div>
            <div style={{ padding: '0.5rem 0', color: 'var(--text-secondary)' }}>{selectedTicket.description}</div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title">Messages ({messages.length})</div>
            {messages.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No messages yet</div>
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
                      {m.senderType === 'ADMIN' ? 'Support Agent' : 'You'} · {fmtDate(m.createAt)}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>{m.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Add Message</div>
            <textarea
              className="text-field"
              rows={3}
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              placeholder="Type your message..."
              style={{ width: '100%', marginBottom: '0.75rem', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button loading={sendingMsg} onClick={sendMessage} disabled={!newMsg.trim()}>
                Send
              </Button>
            </div>
          </div>

          {selectedTicket.status === 'RESOLVED' && !selectedTicket.satisfactionScore && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-title">Rate Your Support Experience</div>
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
            <h1 className="main-header-title">Support</h1>
            <p className="main-header-sub">Get help from our support team</p>
          </div>
        </div>
      </div>

      <div className="main-body">
        {error && <Alert type="error">{error}</Alert>}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button className={`btn ${view === 'list' ? '' : 'ghost'}`} onClick={() => setView('list')}>
            My Tickets {total > 0 && `(${total})`}
          </button>
          <button className={`btn ${view === 'create' ? '' : 'ghost'}`} onClick={() => setView('create')}>
            New Ticket
          </button>
        </div>

        {view === 'create' && (
          <form className="card" onSubmit={createTicket}>
            <div className="card-title">New Support Ticket</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <TextField
                label="Subject"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                required
              />
              <div>
                <label className="field-label">Description</label>
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
                  label="Category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  options={CATEGORY_OPTIONS}
                />
                <SelectField
                  label="Priority"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  options={PRIORITY_OPTIONS}
                />
              </div>
              <div className="btn-row">
                <Button type="submit" loading={creating}>Submit Ticket</Button>
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
              <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>No support tickets yet</div>
              <Button onClick={() => setView('create')}>Create a Ticket</Button>
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
                    <span className={`badge ${STATUS_CLASSES[t.status]}`}>{STATUS_LABELS[t.status]}</span>
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
