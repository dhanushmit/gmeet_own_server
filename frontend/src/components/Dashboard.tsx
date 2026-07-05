import React, { useState, useEffect } from 'react';
import type { Meeting } from '../types';
import { API_URL, UPLOADS_URL } from '../config';
import { Video, Award, Clock, Play, Plus, Link as LinkIcon, Copy, Check, FileText, RefreshCw } from 'lucide-react';

interface DashboardProps {
  onJoinMeeting: (meetId: string) => void;
}

export function Dashboard({ onJoinMeeting }: DashboardProps) {
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
  const [activeTab, setActiveTab] = useState<'scheduled' | 'logs'>('scheduled');

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
  
  const [transcribingMeetId, setTranscribingMeetId] = useState<string | null>(null);
  const [transcriptionStep, setTranscriptionStep] = useState<number>(0);

  const handleTranscribe = async (meetId: string) => {
    if (transcribingMeetId) return;
    setTranscribingMeetId(meetId);
    setTranscriptionStep(1);

    // Setup simulated progress step updates
    const t1 = setTimeout(() => setTranscriptionStep(2), 2000);
    const t2 = setTimeout(() => setTranscriptionStep(3), 5000);
    const t3 = setTimeout(() => setTranscriptionStep(4), 8000);

    try {
      const response = await fetch(`${API_URL}/api/meetings/${meetId}/transcribe`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        const err = await response.json().catch(() => ({}));
        alert(`Transcription failed: ${err.detail || response.statusText}`);
        setTranscribingMeetId(null);
        setTranscriptionStep(0);
        return;
      }

      // Started successfully in background, now poll for completion
      console.log("Transcription triggered in background. Polling for PDF...");
      
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const meetRes = await fetch(`${API_URL}/api/meetings/${meetId}`);
          if (meetRes.ok) {
            const meetData = await meetRes.json();
            if (meetData.transcript_pdf_url) {
              clearInterval(pollInterval);
              clearTimeout(t1);
              clearTimeout(t2);
              clearTimeout(t3);
              setTranscriptionStep(5); // Completed
              
              // Open PDF
              window.open(`${UPLOADS_URL}${meetData.transcript_pdf_url}`, '_blank');
              await fetchMeetings(); // Refresh list
              
              setTimeout(() => {
                setTranscribingMeetId(null);
                setTranscriptionStep(0);
              }, 1500);
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }

        if (pollCount >= 30) { // Timeout after 60 seconds (30 * 2s)
          clearInterval(pollInterval);
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
          alert("Transcription is taking longer than expected. Please click the Refresh button in a few moments to download the PDF.");
          setTranscribingMeetId(null);
          setTranscriptionStep(0);
          fetchMeetings();
        }
      }, 2000); // Poll every 2 seconds

    } catch (err) {
      console.error(err);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      alert('Network error triggering transcription.');
      setTranscribingMeetId(null);
      setTranscriptionStep(0);
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
        const errorData = await response.json().catch(() => ({}));
        alert(`Failed to generate meeting link: ${errorData.detail || 'Unknown server error'}`);
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
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '32px', alignItems: 'start' }}>
        {/* Left Column: Meetings list */}
        <div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '12px' }}>
            <button 
              onClick={() => setActiveTab('scheduled')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeTab === 'scheduled' ? 'var(--primary)' : 'var(--text-secondary)',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
                borderBottom: activeTab === 'scheduled' ? '2px solid var(--primary)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <Video size={18} /> Scheduled Interviews
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeTab === 'logs' ? 'var(--primary)' : 'var(--text-secondary)',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
                borderBottom: activeTab === 'logs' ? '2px solid var(--primary)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <FileText size={18} /> Conversion Logs
            </button>
          </div>
          
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading meetings...</div>
          ) : error ? (
            <div className="glass-card" style={{ borderLeft: '4px solid var(--danger)', padding: '20px' }}>
              <p style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: '8px' }}>Connection Error</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{error}</p>
              <button className="btn-secondary" onClick={fetchMeetings} style={{ marginTop: '16px', padding: '8px 16px', fontSize: '0.9rem' }}>
                Retry Connection
              </button>
            </div>
          ) : meetings.filter(m => activeTab === 'scheduled' ? m.status !== 'Completed' : m.status === 'Completed').length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: 'var(--text-secondary)' }}>
                {activeTab === 'scheduled' ? "No scheduled meetings found." : "No completed call logs found."}
              </p>
            </div>
          ) : (
            <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {meetings
                .filter(m => activeTab === 'scheduled' ? m.status !== 'Completed' : m.status === 'Completed')
                .map((meet) => (
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

                  <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {meet.status === 'Completed' ? (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                            {meet.recording_url && (
                              <a 
                                href={`${UPLOADS_URL}${meet.recording_url}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="btn-secondary" 
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none', padding: '8px 0', fontSize: '0.85rem' }}
                              >
                                <Play size={14} /> Video
                              </a>
                            )}
                            {meet.transcript_pdf_url && (
                              <a 
                                href={`${UPLOADS_URL}${meet.transcript_pdf_url}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="btn-secondary" 
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none', padding: '8px 0', fontSize: '0.85rem' }}
                              >
                                <FileText size={14} /> PDF Log
                              </a>
                            )}
                          </div>
                          {meet.recording_url && (
                            <>
                              <button
                                onClick={() => handleTranscribe(meet.id)}
                                disabled={transcribingMeetId !== null}
                                className="btn-primary"
                                style={{ 
                                  width: '100%', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  gap: '8px', 
                                  padding: '8px 0', 
                                  fontSize: '0.85rem',
                                  background: 'linear-gradient(135deg, var(--success), #059669)',
                                  cursor: transcribingMeetId !== null ? 'not-allowed' : 'pointer',
                                  opacity: transcribingMeetId !== null ? 0.7 : 1,
                                  border: 'none',
                                  borderRadius: '4px',
                                  color: '#fff',
                                  boxShadow: 'none'
                                }}
                              >
                                {transcribingMeetId === meet.id ? (
                                  <>
                                    <RefreshCw size={14} className="animate-spin" /> Transcribing...
                                  </>
                                ) : (
                                  <>
                                    <Award size={14} /> Audio to Text Convert
                                  </>
                                )}
                              </button>
                              
                              {transcribingMeetId === meet.id && (
                                <div style={{ 
                                  marginTop: '6px', 
                                  padding: '12px', 
                                  background: 'rgba(255, 255, 255, 0.03)', 
                                  borderRadius: '6px', 
                                  border: '1px solid rgba(255, 255, 255, 0.05)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px'
                                }}>
                                  <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e5e7eb', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <RefreshCw size={11} className="animate-spin" style={{ color: 'var(--success)' }} />
                                    Transcription Progress Flow:
                                  </p>
                                  {[
                                    { id: 1, text: "Extracting recorded audio file..." },
                                    { id: 2, text: "Running Whisper voice transcription..." },
                                    { id: 3, text: "Analyzing sentiment & vocal tones..." },
                                    { id: 4, text: "Compiling premium PDF report..." },
                                  ].map((s) => {
                                    const isDone = transcriptionStep > s.id;
                                    const isCurrent = transcriptionStep === s.id;
                                    return (
                                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
                                        {isDone ? (
                                          <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>✓</span>
                                        ) : isCurrent ? (
                                          <RefreshCw size={10} className="animate-spin" style={{ color: 'var(--success)' }} />
                                        ) : (
                                          <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>○</span>
                                        )}
                                        <span style={{ 
                                          color: isDone ? 'rgba(255, 255, 255, 0.6)' : isCurrent ? 'var(--success)' : 'rgba(255, 255, 255, 0.3)',
                                          fontWeight: isCurrent ? 600 : 'normal'
                                        }}>
                                          {s.text}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}
                          
                          {meet.transcript_pdf_url && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--success)', marginTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '8px' }}>
                              <span>✓ Conversion Finished</span>
                              <a 
                                href={`${UPLOADS_URL}${meet.transcript_pdf_url}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ color: 'var(--primary)', textDecoration: 'underline', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}
                              >
                                <FileText size={12} /> Download PDF
                              </a>
                            </div>
                          )}
                          
                          {meet.transcript_json && (
                            <div style={{ 
                              marginTop: '8px', 
                              padding: '10px', 
                              background: 'rgba(0, 0, 0, 0.25)', 
                              borderRadius: '4px', 
                              borderLeft: '3px solid var(--primary)', 
                              maxHeight: '180px', 
                              overflowY: 'auto',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px'
                            }}>
                              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '4px', marginBottom: '2px' }}>
                                Converted Text Transcript:
                              </p>
                              {(() => {
                                try {
                                  const parsed = JSON.parse(meet.transcript_json);
                                  if (Array.isArray(parsed) && parsed.length > 0) {
                                    return parsed.map((line: any, idx: number) => {
                                      let spkColor = 'var(--primary)';
                                      if (line.speaker?.toLowerCase().includes('ai')) {
                                        spkColor = '#c084fc';
                                      } else if (line.speaker?.toLowerCase() !== 'admin' && line.speaker?.toLowerCase() !== 'host') {
                                        spkColor = '#2dd4bf';
                                      }
                                      return (
                                        <div key={idx} style={{ fontSize: '0.72rem', lineHeight: '1.3', color: '#e5e7eb' }}>
                                          <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>[{line.timestamp || '00:00'}]</span>
                                          <span style={{ color: spkColor, fontWeight: 600 }}>{line.speaker}:</span>{' '}
                                          <span>{line.text}</span>
                                        </div>
                                      );
                                    });
                                  }
                                } catch (e) {
                                  console.error("Error parsing transcript json", e);
                                }
                                return <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No dialog transcribed yet.</span>;
                              })()}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>Attended</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {Math.floor(meet.attendance_duration / 60)}m {meet.attendance_duration % 60}s
                          </span>
                        </div>
                      </>
                    ) : (
                      <button 
                        className="btn-primary" 
                        onClick={() => onJoinMeeting(meet.id)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 0' }}
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
