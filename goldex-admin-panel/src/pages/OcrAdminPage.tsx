import { useEffect, useState } from 'react'
import { api } from '../api/client'

interface OcrHealth {
  status: string
  model_loaded: boolean
  model_name?: string
  model_language?: string
  model_path?: string
}

interface TrainStatus {
  state: string
  started_at?: number
  last_train_at?: number
  last_result?: any
  error?: string
  sample_count: number
  available_samples: number
}

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  idle: { label: 'آماده', color: 'var(--text-muted)' },
  training: { label: 'در حال آموزش', color: '#f0ad4e' },
  completed: { label: 'تکمیل شد', color: '#5cb85c' },
  failed: { label: 'خطا', color: '#d9534f' },
}

export default function OcrAdminPage() {
  const [health, setHealth] = useState<OcrHealth | null>(null)
  const [trainStatus, setTrainStatus] = useState<TrainStatus | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [h, t] = await Promise.all([
        api.get('/ocr/health').then((r: any) => r.data.data),
        api.get('/ocr/train/status').then((r: any) => r.data.data),
      ])
      setHealth(h)
      setTrainStatus(t)
    } catch (e: any) {
      setError('Failed to load OCR status: ' + (e?.response?.data?.message || e.message))
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      await api.post('/ocr/train/trigger')
      setTimeout(load, 2000)
    } catch (e: any) {
      setError('Failed to trigger training: ' + (e?.response?.data?.message || e.message))
    } finally {
      setTriggering(false)
    }
  }

  const st = trainStatus
  const stLabel = st ? STATE_LABEL[st.state] || STATE_LABEL.idle : STATE_LABEL.idle

  return (
    <div className="page">
      <div className="page-title">مدیریت OCR</div>

      {error && (
        <div className="alert alert-danger" style={{ padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
          <button className="btn btn-ghost" onClick={() => setError('')} style={{ marginRight: 8 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Model Info */}
        <div className="card">
          <div className="card-title">📦 مدل OCR</div>
          <div style={{ padding: 12, fontSize: 14, lineHeight: 2 }}>
            <div><strong>وضعیت:</strong> {health?.model_loaded ? '✅ فعال' : '❌ غیرفعال'}</div>
            <div><strong>نام مدل:</strong> {health?.model_name || '—'}</div>
            <div><strong>زبان:</strong> {health?.model_language || '—'}</div>
            <div><strong>مسیر:</strong> <code style={{ fontSize: 12 }}>{health?.model_path || '—'}</code></div>
            <div><strong>وضعیت سرویس:</strong> {health?.status || '—'}</div>
          </div>
        </div>

        {/* Training Status */}
        <div className="card">
          <div className="card-title">🧠 آموزش خودکار</div>
          <div style={{ padding: 12, fontSize: 14, lineHeight: 2 }}>
            <div>
              <strong>وضعیت:</strong>{' '}
              <span style={{ color: stLabel.color, fontWeight: 600 }}>{stLabel.label}</span>
            </div>
            <div><strong>نمونه‌های موجود:</strong> {st?.available_samples ?? '—'}</div>
            <div><strong>نمونه‌های آموزش:</strong> {st?.sample_count ?? '—'}</div>
            {st?.last_train_at && (
              <div>
                <strong>آخرین آموزش:</strong>{' '}
                {new Date(st.last_train_at * 1000).toLocaleString('fa-IR')}
              </div>
            )}
            {st?.error && (
              <div style={{ color: '#d9534f' }}>
                <strong>خطا:</strong> {st.error}
              </div>
            )}
            {st?.last_result?.stdout && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
                  مشاهده خروجی
                </summary>
                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', marginTop: 4, maxHeight: 150, overflow: 'auto', background: '#1a1a2e', color: '#ccc', padding: 8, borderRadius: 4 }}>
                  {st.last_result.stdout}
                </pre>
              </details>
            )}
          </div>
          <div style={{ padding: '0 12px 12px' }}>
            <button
              className="btn btn-primary"
              onClick={handleTrigger}
              disabled={triggering || st?.state === 'training'}
            >
              {triggering ? '⏳ در حال شروع...' : st?.state === 'training' ? '⏳ در حال آموزش' : '🚀 شروع آموزش'}
            </button>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="card">
        <div className="card-title">ℹ️ نحوه عملکرد</div>
        <div style={{ padding: 12, fontSize: 13, lineHeight: 2 }}>
          <p>سیستم OCR با جمع‌آوری بازخورد از کاربران (تصحیح متن‌های استخراج شده) بهبود می‌یابد.</p>
          <ol style={{ marginRight: 20 }}>
            <li>کاربر رسید بانکی را آپلود می‌کند</li>
            <li>سرویس OCR متن را استخراج می‌کند</li>
            <li>کاربر اطلاعات را تصحیح می‌کند ← بازخورد ذخیره می‌شود</li>
            <li>مدیر با کلیک روی دکمه بالا آموزش مدل را شروع می‌کند</li>
            <li>مدل جدید به‌صورت خودکار جایگزین می‌شود (بدون نیاز به restart)</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
