import React, { useState, useEffect } from 'react';
import type { Meeting } from '../types';
import { Video, Award, Clock, Play, Plus, Link as LinkIcon } from 'lucide-react';

interface DashboardProps {
  onJoinMeeting: (meetId: string) => void;
}

export function Dashboard({ onJoinMeeting }: DashboardProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customRoomId, setCustomRoomId] = useState('');

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/meetings');
      if (response.ok) {
        const data = await response.json();
        setMeetings(data);
        setError(null);
      } else {
        setError('Failed to fetch scheduled interviews.');
      }
    } catch (err) {
      console.error(err);
      setError('Could not connect to FastAPI server. Please ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (customRoomId.trim()) {
      onJoinMeeting(customRoomId.trim().toLowerCase());
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <div className="logo-icon">TM</div>
          <div>
            <h1 className="logo-text">Tech-Meet</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Premium Video Conferencing & Mock Interviews</p>
          </div>
        </div>
        <button className="btn-secondary" onClick={fetchMeetings} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} /> Refresh
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px', alignItems: 'start' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Video className="text-primary" /> Scheduled Interview Rounds
          </h2>
          
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading scheduled meetings...</div>
          ) : error ? (
            <div className="glass-card" style={{ borderLeft: '4px solid var(--danger)', padding: '20px' }}>
              <p style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: '8px' }}>Connection Error</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{error}</p>
              <button className="btn-secondary" onClick={fetchMeetings} style={{ marginTop: '16px', padding: '8px 16px', fontSize: '0.9rem' }}>
                Retry Connection
              </button>
            </div>
          ) : meetings.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: 'var(--text-secondary)' }}>No scheduled meetings found.</p>
            </div>
          ) : (
            <div className="dashboard-grid">
              {meetings.map((meet) => (
                <div key={meet.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'between', minHeight: '220px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                      <span className="glass-panel" style={{ 
                        fontSize: '0.75rem', 
                        padding: '4px 10px', 
                        background: meet.status === 'Completed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                        borderColor: meet.status === 'Completed' ? 'var(--success)' : 'var(--primary)',
                        color: meet.status === 'Completed' ? 'var(--success)' : 'var(--primary)',
                        fontWeight: 600
                      }}>
                        {meet.status}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {meet.id}</span>
                    </div>
                    
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>{meet.title}</h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Award size={16} className="text-secondary" /> {meet.position_domain}
                    </p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                      <Clock size={14} /> {meet.round_name}
                    </p>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', gap: '12px' }}>
                    {meet.status === 'Completed' ? (
                      <>
                        {meet.recording_url && (
                          <a 
                            href={`http://localhost:8000${meet.recording_url}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="btn-secondary" 
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', textDecoration: 'none', padding: '10px 0', fontSize: '0.9rem' }}
                          >
                            <Play size={14} /> Play WebM
                          </a>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', color: 'var(--text-muted)', justifyContent: 'center' }}>
                          <span>Attendance: <strong>{meet.attendance_status}</strong></span>
                          <span>Duration: <strong>{Math.floor(meet.attendance_duration / 60)}m {meet.attendance_duration % 60}s</strong></span>
                        </div>
                      </>
                    ) : (
                      <button 
                        className="btn-primary" 
                        onClick={() => onJoinMeeting(meet.id)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 0' }}
                      >
                        Enter Lobby
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="glass-panel" style={{ padding: '24px', position: 'sticky', top: '40px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={20} className="text-primary" /> Instant Meeting
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Create or join an ad-hoc room. Share the room code with a colleague to connect directly.
            </p>
            
            <form onSubmit={handleCustomJoin}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Room ID / Code
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. mock-interview-101" 
                  value={customRoomId} 
                  onChange={(e) => setCustomRoomId(e.target.value)} 
                  required
                />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <LinkIcon size={16} /> Connect Room
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
