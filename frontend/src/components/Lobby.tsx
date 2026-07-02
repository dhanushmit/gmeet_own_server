import React, { useState, useEffect, useRef } from 'react';
import type { Meeting } from '../types';
import { Video, VideoOff, Mic, MicOff, User, ArrowLeft, ArrowRight, ShieldAlert } from 'lucide-react';

interface LobbyProps {
  meetId: string;
  onJoin: (displayName: string, videoEnabled: boolean, audioEnabled: boolean, autoPilot: boolean) => void;
  onBack: () => void;
}

export function Lobby({ meetId, onJoin, onBack }: LobbyProps) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [autoPilot, setAutoPilot] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch meeting metadata
  useEffect(() => {
    fetch(`http://localhost:8000/api/meetings/${meetId}`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Meeting not found');
      })
      .then((data) => setMeeting(data))
      .catch((err) => {
        console.warn(err);
        // Fallback for custom room IDs
        setMeeting({
          id: meetId,
          title: `Custom Meet Room: ${meetId}`,
          position_domain: 'Ad-hoc Conference',
          round_name: 'Peer-to-Peer Calling / Solo AI Testing',
          attendance_status: 'Absent',
          attendance_duration: 0,
          status: 'Scheduled'
        });
      });
  }, [meetId]);

  // Request camera and microphone stream
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function setupMedia() {
      try {
        setPermissionError(null);
        const constraints = {
          video: videoEnabled ? { width: 640, height: 360 } : false,
          audio: audioEnabled,
        };

        if (!videoEnabled && !audioEnabled) {
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
          }
          return;
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Error accessing media devices:', err);
        setPermissionError(
          'Could not access camera or microphone. Please check your browser permissions and ensure no other application is using them.'
        );
      }
    }

    setupMedia();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [videoEnabled, audioEnabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    
    // Stop local stream so it can be re-initialized in the meeting room
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    
    onJoin(displayName.trim(), videoEnabled, audioEnabled, autoPilot);
  };

  return (
    <div className="app-container" style={{ maxWidth: '900px' }}>
      <button onClick={onBack} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '24px' }}>Pre-join Lobby</h2>

      <div className="lobby-container">
        {/* Left Side: Video Preview */}
        <div>
          <div className="camera-preview-box">
            {videoEnabled && stream ? (
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="camera-video"
                style={{ transform: 'rotateY(180deg)' }} // Mirror view
              />
            ) : (
              <div className="camera-placeholder">
                <VideoOff size={48} className="text-muted" />
                <p>{!videoEnabled ? 'Camera is turned off' : 'Requesting camera stream...'}</p>
              </div>
            )}

            <div className="preview-controls">
              <button 
                type="button" 
                onClick={() => setAudioEnabled(!audioEnabled)} 
                className={`control-btn ${!audioEnabled ? 'active' : ''}`}
                title={audioEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button 
                type="button" 
                onClick={() => setVideoEnabled(!videoEnabled)} 
                className={`control-btn ${!videoEnabled ? 'active' : ''}`}
                title={videoEnabled ? 'Stop Camera' : 'Start Camera'}
              >
                {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
            </div>
          </div>
          
          {permissionError && (
            <div className="glass-panel" style={{ display: 'flex', gap: '12px', padding: '16px', marginTop: '16px', borderLeft: '4px solid var(--warning)', background: 'rgba(245, 158, 11, 0.05)' }}>
              <ShieldAlert className="text-warning" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{permissionError}</p>
            </div>
          )}
        </div>

        {/* Right Side: Meta Card & Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {meeting && (
            <div className="glass-panel" style={{ padding: '20px' }}>
              <span className="glass-panel" style={{ 
                fontSize: '0.75rem', 
                padding: '4px 10px', 
                color: 'var(--primary)', 
                borderColor: 'var(--primary)',
                background: 'rgba(99, 102, 241, 0.1)', 
                fontWeight: 600,
                display: 'inline-block',
                marginBottom: '12px'
              }}>
                Interview Details
              </span>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>{meeting.title}</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <strong>Role:</strong> {meeting.position_domain}
              </p>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <strong>Round:</strong> {meeting.round_name}
              </p>
            </div>
          )}

          <div className="glass-panel" style={{ padding: '24px' }}>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
                  Enter Display Name
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="e.g. Alex Morgan" 
                    value={displayName} 
                    onChange={(e) => setDisplayName(e.target.value)} 
                    style={{ paddingLeft: '44px' }}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid var(--glass-border)', padding: '12px', borderRadius: '8px' }}>
                <input 
                  type="checkbox" 
                  id="autoPilotToggle" 
                  checked={autoPilot} 
                  onChange={(e) => setAutoPilot(e.target.checked)} 
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="autoPilotToggle" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer', flex: 1 }}>
                  <strong style={{ display: 'block', color: 'var(--success)' }}>Enable Auto-Pilot Mode</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Automates recording, AI peer, and uploads.</span>
                </label>
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                Join Meeting <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
