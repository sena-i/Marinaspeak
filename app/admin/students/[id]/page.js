'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { formatDate, formatTimestamp, formatDuration, truncate } from '@/lib/utils/formatters';

const RechartsLineChart = dynamic(() => import('recharts').then(mod => {
  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = mod;
  return { default: ({ data, dataKeys, height = 300 }) => (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis domain={dataKeys[0].domain} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {dataKeys.map(k => (
          <Line key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={k.color} strokeWidth={2} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )};
}), { ssr: false, loading: () => <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="text-secondary">Loading chart...</div> });

export default function StudentDetail({ params }) {
  const { id } = use(params);
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSession, setExpandedSession] = useState(null);
  const [audioUrls, setAudioUrls] = useState({});
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('speakalize_admin_token');
    if (!token) {
      router.push('/admin');
      return;
    }

    const headers = { 'Authorization': `Bearer ${token}` };

    Promise.all([
      fetch(`/api/admin/students/${id}/sessions`, { headers }).then(r => r.json()),
      fetch(`/api/admin/students/${id}/progress`, { headers }).then(r => r.json())
    ])
      .then(([sessionsData, progressData]) => {
        setSessions(sessionsData.sessions || []);
        setStats(sessionsData.stats || null);
        setProgress(progressData.progress || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load student data');
        setLoading(false);
      });
  }, [id, router]);

  function loadAudioUrl(sessionId, filePath) {
    if (audioUrls[sessionId]) return;
    const token = localStorage.getItem('speakalize_admin_token');
    fetch(`/api/admin/audio?path=${encodeURIComponent(filePath)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.url) {
          setAudioUrls(prev => ({ ...prev, [sessionId]: data.url }));
        }
      })
      .catch(() => {});
  }

  if (loading) {
    return (
      <div className="container-wide text-center" style={{ marginTop: '4rem' }}>
        <p className="text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container-wide">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h1>Student: {id}</h1>
          <p className="text-secondary">{sessions.length} total sessions</p>
        </div>
        <button className="btn btn-secondary" onClick={() => router.push('/admin/students')}>
          Back to List
        </button>
      </div>

      {error && <p className="error-text mb-2">{error}</p>}

      {/* Stats */}
      {stats && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.totalSessions}</div>
            <div className="stat-label">Total Sessions</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.avgWpm ?? '-'}</div>
            <div className="stat-label">Avg WPM</div>
          </div>
        </div>
      )}

      {/* WPM Progress Chart */}
      {progress.length > 0 && (
        <div className="card mb-2">
          <h2 className="mb-2">WPM Progress</h2>
          <RechartsLineChart
            data={progress}
            height={250}
            dataKeys={[
              { key: 'avgWpm', name: 'WPM', color: '#f59e0b' }
            ]}
          />
        </div>
      )}

      {/* Sessions Table */}
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <h2 style={{ padding: '1.25rem 1.25rem 0' }}>Session History</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>WPM</th>
              <th>Words</th>
              <th>Focus Points</th>
              <th>Transcription</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-secondary" style={{ padding: '2rem' }}>
                  No sessions yet
                </td>
              </tr>
            ) : (
              sessions.map(session => (
                <tr
                  key={session.id}
                  onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{formatTimestamp(session.created_at)}</td>
                  <td>{session.wpm ?? '-'}</td>
                  <td>{session.word_count}</td>
                  <td>{session.focus_points ? truncate(session.focus_points, 30) : '-'}</td>
                  <td>{truncate(session.transcription, 60)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Expanded Session Detail */}
      {expandedSession && (() => {
        const session = sessions.find(s => s.id === expandedSession);
        if (!session) return null;
        return (
          <div className="card mt-2">
            <div className="flex justify-between items-center mb-2">
              <h2>Session Detail</h2>
              <button className="btn btn-secondary" onClick={() => setExpandedSession(null)}>Close</button>
            </div>
            <p className="text-secondary mb-2">{formatTimestamp(session.created_at)}</p>

            {session.audio_file_path && (
              <div style={{ marginBottom: '1rem' }}>
                {audioUrls[session.id] ? (
                  <audio controls style={{ width: '100%' }} src={audioUrls[session.id]} />
                ) : (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8125rem' }}
                    onClick={() => loadAudioUrl(session.id, session.audio_file_path)}
                  >
                    Load Audio
                  </button>
                )}
              </div>
            )}

            <h2 className="mb-1" style={{ fontSize: '0.9375rem' }}>Transcription</h2>
            <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>
              {session.transcription}
            </p>

            {session.focus_points && (
              <>
                <h2 className="mb-1" style={{ fontSize: '0.9375rem' }}>Focus Points</h2>
                <p style={{ fontSize: '0.875rem', marginBottom: '1rem', color: 'var(--primary)' }}>{session.focus_points}</p>
              </>
            )}

            {session.corrections?.length > 0 && (
              <>
                <h2 className="mb-1" style={{ fontSize: '0.9375rem' }}>Corrections</h2>
                <div style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
                  {session.corrections.map((c, i) => (
                    <div key={i} style={{ marginBottom: '0.5rem' }}>
                      <p>
                        <span style={{ color: 'var(--error)' }}>{c.original}</span>
                        {' → '}
                        <span style={{ color: '#22c55e' }}><strong>{c.corrected}</strong></span>
                      </p>
                      {c.explanation && (
                        <p className="text-secondary" style={{ fontSize: '0.8125rem' }}>{c.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {session.coach_comment && (() => {
              let comment = session.coach_comment;
              try { comment = JSON.parse(session.coach_comment); } catch {}
              if (typeof comment === 'object' && comment.praise) {
                return (
                  <>
                    <h2 className="mb-1" style={{ fontSize: '0.9375rem' }}>Coach Comment</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem', marginBottom: '1rem' }}>
                      {comment.praise && (
                        <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(245, 158, 11, 0.08)' }}>
                          <p style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Good Point</p>
                          <p>{comment.praise}</p>
                        </div>
                      )}
                      {comment.content && (
                        <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(99, 102, 241, 0.08)' }}>
                          <p style={{ fontWeight: 600, color: '#6366f1', marginBottom: '0.25rem' }}>Content</p>
                          <p>{comment.content}</p>
                        </div>
                      )}
                      {comment.nextAction && (
                        <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(34, 197, 94, 0.08)' }}>
                          <p style={{ fontWeight: 600, color: '#22c55e', marginBottom: '0.25rem' }}>Next Action</p>
                          <p>{comment.nextAction}</p>
                        </div>
                      )}
                    </div>
                  </>
                );
              }
              return (
                <>
                  <h2 className="mb-1" style={{ fontSize: '0.9375rem' }}>Coach Comment</h2>
                  <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{session.coach_comment}</p>
                </>
              );
            })()}

            {session.feedback_text && (
              <>
                <h2 className="mb-1" style={{ fontSize: '0.9375rem' }}>Full Feedback</h2>
                <p style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{session.feedback_text}</p>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
