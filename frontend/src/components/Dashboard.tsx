import React, { useState, useEffect } from 'react';
import type { Meeting } from '../types';
import { API_URL, UPLOADS_URL } from '../config';
import { Video, Award, Clock, Play, Plus, Link as LinkIcon, LogOut, Copy, Check } from 'lucide-react';

interface DashboardProps {
  onJoinMeeting: (meetId: string) => void;
  onLogout: () => void;
}

export function Dashboard({ onJoinMeeting, onLogout }: DashboardProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states for meeting creation
  const [title, setTitle] = useState('Senior React Developer Interview');
  const [positionDomain, setPositionDomain] = useState('Frontend Engineering');
  const [roundName, setRoundName] = useState('Technical Architecture & Live Coding');
  const [scheduledTime, setScheduledTime] = useState('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/meetings`);
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

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !positionDomain || !roundName || !scheduledTime) return;

    try {
      const response = await fetch(`${API_URL}/api/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          position_domain: positionDomain,
          round_name: roundName,
          scheduled_time: scheduledTime,
        }),
      });

      if (response.ok) {
        const newMeeting = await response.json();
        const link = `${window.location.origin}/?join=${newMeeting.id}`;
        setGeneratedLink(link);
        setCopySuccess(false);
        fetchMeetings(); // Refresh meeting list
      } else {
        alert('Failed to generate meeting link.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to backend.');
    }
  };

  const copyToClipboard = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
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
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" onClick={fetchMeetings} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} /> Refresh
          </button>
          <button 
            className="btn-secondary" 
            onClick={onLogout} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              borderColor: 'rgba(239, 68, 68, 0.4)', 
              color: 'var(--danger)' 
            }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px', alignItems: 'start' }}>
        {/* Left Column: Meetings list */}
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Video className="text-primary" /> Active & Scheduled Interview Rounds
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
            <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {meetings.map((meet) => (
                <div key={meet.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'between', minHeight: '230px' }}>
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
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{meet.id}</span>
                    </div>
                    
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '8px', lineHeight: '1.4' }}>{meet.title}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Award size={14} className="text-secondary" /> {meet.position_domain}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Clock size={12} /> {meet.round_name}
                    </p>
                    {meet.scheduled_time && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                        <Clock size={12} /> {new Date(meet.scheduled_time).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', gap: '12px' }}>
                    {meet.status === 'Completed' ? (
                      <>
                        {meet.recording_url && (
                          <a 
                            href={`${UPLOADS_URL}${meet.recording_url}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="btn-secondary" 
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', textDecoration: 'none', padding: '10px 0', fontSize: '0.9rem' }}
                          >
                            <Play size={14} /> Play WebM
                          </a>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', color: 'var(--text-muted)', justifyContent: 'center' }}>
                          <span>Attended</span>
                          <span>{Math.floor(meet.attendance_duration / 60)}m {meet.attendance_duration % 60}s</span>
                        </div>
                      </>
                    ) : (
                      <button 
                        className="btn-primary" 
                        onClick={() => onJoinMeeting(meet.id)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 0' }}
                      >
                        Start Meeting
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Generate link card */}
        <div>
          <div className="glass-panel" style={{ padding: '24px', position: 'sticky', top: '40px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={20} className="text-primary" /> Generate Interview Link
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Schedule a new call and generate a direct candidate invitation link.
            </p>
            
            <form onSubmit={handleGenerateLink}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Interview Title
                </label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Position / Domain
                </label>
                <input 
                  type="text" 
                  value={positionDomain} 
                  onChange={(e) => setPositionDomain(e.target.value)} 
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Round Name
                </label>
                <input 
                  type="text" 
                  value={roundName} 
                  onChange={(e) => setRoundName(e.target.value)} 
                  required
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Scheduled Date & Time
                </label>
                <input 
                  type="datetime-local" 
                  value={scheduledTime} 
                  onChange={(e) => setScheduledTime(e.target.value)} 
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-family)',
                    fontSize: '1rem',
                    outline: 'none',
                    transition: 'var(--transition-smooth)'
                  }}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <LinkIcon size={16} /> Generate Invite Link
              </button>
            </form>

            {generatedLink && (
              <div className="glass-panel" style={{ 
                marginTop: '20px', 
                padding: '14px', 
                background: 'rgba(16, 185, 129, 0.05)', 
                borderColor: 'var(--success)' 
              }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600, marginBottom: '6px' }}>
                  Candidate Invitation Link
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    value={generatedLink} 
                    readOnly 
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{ fontSize: '0.8rem', padding: '8px', flex: 1 }}
                  />
                  <button 
                    onClick={copyToClipboard}
                    className="btn-secondary"
                    style={{ 
                      width: '38px', 
                      height: '38px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      padding: 0,
                      borderRadius: '8px',
                      background: copySuccess ? 'var(--success)' : 'rgba(255,255,255,0.05)',
                      borderColor: copySuccess ? 'var(--success)' : 'var(--glass-border)',
                      color: '#fff'
                    }}
                    title="Copy to Clipboard"
                  >
                    {copySuccess ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
