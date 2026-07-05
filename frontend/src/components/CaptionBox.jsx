import React, { useState, useEffect, useRef } from 'react';
import CaptionEngine from '../CaptionEngine';

export default function CaptionBox({ socket, roomId, participantName, isMicMuted, localStream, role }) {
  const [messages, setMessages] = useState([]);
  const [activeCaptions, setActiveCaptions] = useState({});
  const [attendees, setAttendees] = useState([participantName]);
  const [showAttendees, setShowAttendees] = useState(false);
  const [captionLanguage, setCaptionLanguage] = useState('en-IN');
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState(null);
  
  const engineRef = useRef(null);
  const messageEndRef = useRef(null);

  // Initialize and clean up CaptionEngine
  useEffect(() => {
    if (!socket || !roomId || !participantName) return;

    // Join room on backend caption server
    socket.emit('join-room', { roomId, participantName });
    socket.emit('mic-state', { isMuted: isMicMuted });

    // Instanciate engine
    const engine = new CaptionEngine(
      socket,
      roomId,
      participantName,
      // onFinal
      (speaker, text) => {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages((prev) => [
          ...prev,
          { id: Math.random().toString(), sender: speaker, text: `[Live Caption] ${text}`, timestamp: timeStr }
        ]);
        setActiveCaptions((prev) => ({
          ...prev,
          [speaker]: { text, isFinal: true, timestamp: Date.now() }
        }));
      },
      // onInterim
      (speaker, text) => {
        setActiveCaptions((prev) => ({
          ...prev,
          [speaker]: { text, isFinal: false, timestamp: Date.now() }
        }));
      }
    );

    engine.setLanguage(captionLanguage);
    engineRef.current = engine;

    // Socket events
    socket.on('peer-joined', ({ sender }) => {
      setAttendees((prev) => prev.includes(sender) ? prev : [...prev, sender]);
      setMessages((prev) => [
        ...prev,
        { id: Math.random().toString(), sender: 'System', text: `${sender} joined the meeting.`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]);
    });

    socket.on('peer-left', ({ sender }) => {
      setAttendees((prev) => prev.filter((u) => u !== sender));
      setMessages((prev) => [
        ...prev,
        { id: Math.random().toString(), sender: 'System', text: `${sender} left the meeting.`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]);
    });

    socket.on('caption', (data) => {
      // Receive final and interim captions from all participants
      setActiveCaptions((prev) => ({
        ...prev,
        [data.sender]: { text: data.text, isFinal: data.isFinal, timestamp: Date.now() }
      }));

      if (data.isFinal && data.sender !== participantName) {
        setMessages((prev) => [
          ...prev,
          { id: Math.random().toString(), sender: data.sender, text: `[Live Caption] ${data.text}`, timestamp: data.timestamp }
        ]);
      }
    });

    return () => {
      engine.stop();
      socket.off('peer-joined');
      socket.off('peer-left');
      socket.off('caption');
    };
  }, [socket, roomId, participantName]);

  // Sync mic toggle
  useEffect(() => {
    if (socket) {
      socket.emit('mic-state', { isMuted: isMicMuted });
    }

    if (engineRef.current) {
      if (!isMicMuted && localStream) {
        engineRef.current.start(localStream);
      } else {
        engineRef.current.stop();
      }
    }
  }, [isMicMuted, localStream]);

  // Clean up stale captions
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setActiveCaptions((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.entries(next).forEach(([user, data]) => {
          if ((data.isFinal && now - data.timestamp > 4000) || (!data.isFinal && now - data.timestamp > 6000)) {
            delete next[user];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync language selection
  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    setCaptionLanguage(lang);
    if (engineRef.current) {
      engineRef.current.setLanguage(lang);
    }
  };

  // End meeting and download report
  const handleEndMeeting = async () => {
    try {
      // Direct call to caption-server backend port 4000
      const res = await fetch(`http://localhost:4000/api/meetings/${roomId}/end`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.pdfUrl) {
        setPdfDownloadUrl(`http://localhost:4000${data.pdfUrl}`);
      }
    } catch (err) {
      console.error('Failed to end meeting on caption server:', err);
    }
  };

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', background: '#090d16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', marginTop: '20px' }}>
      
      {/* Settings bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Caption Language:</label>
          <select 
            value={captionLanguage} 
            onChange={handleLanguageChange}
            style={{ background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem' }}
          >
            <option value="en-IN">English (India)</option>
            <option value="en-US">English (US)</option>
            <option value="ta-IN">Tamil (India)</option>
            <option value="hi-IN">Hindi (India)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setShowAttendees(!showAttendees)}
            style={{ padding: '6px 12px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#818cf8', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            {showAttendees ? 'Hide Attendees' : `Attendees (${attendees.length})`}
          </button>
          
          {role === 'admin' && (
            <button 
              onClick={handleEndMeeting}
              style={{ padding: '6px 12px', background: 'var(--danger, #ef4444)', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
            >
              End Session & Log PDF
            </button>
          )}
        </div>
      </div>

      {/* Attendees list (collapsible) */}
      {showAttendees && (
        <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#9ca3af', marginBottom: '8px', display: 'block' }}>Meeting Attendees:</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {attendees.map(user => (
              <span key={user} style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', color: '#e5e7eb', padding: '3px 8px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                {user} {user === participantName && '(You)'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* On-screen Captions overlay */}
      {Object.keys(activeCaptions).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%', margin: '10px 0' }}>
          {Object.entries(activeCaptions).map(([user, data]) => {
            if (!data.text.trim()) return null;
            return (
              <div key={user} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '8px', background: 'rgba(15, 23, 42, 0.85)', padding: '8px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontWeight: 700, color: '#818cf8', fontSize: '0.9rem' }}>{user}:</span>
                <span style={{ color: '#f8fafc', fontSize: '0.9rem', fontStyle: !data.isFinal ? 'italic' : 'normal', opacity: !data.isFinal ? 0.75 : 1 }}>
                  {data.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Download Alert */}
      {pdfDownloadUrl && (
        <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 500 }}>Meeting transcript PDF log is ready for download!</span>
          <a 
            href={pdfDownloadUrl} 
            download
            style={{ padding: '4px 10px', background: '#10b981', color: '#fff', textDecoration: 'none', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}
          >
            Download PDF
          </a>
        </div>
      )}
    </div>
  );
}
