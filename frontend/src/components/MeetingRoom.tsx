import React, { useState, useEffect, useRef } from 'react';
import type { Message } from '../types';
import { useRecording } from '../hooks/useRecording';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  MessageSquare, PhoneOff, Send, Cpu, Sparkles 
} from 'lucide-react';

interface MeetingRoomProps {
  meetId: string;
  displayName: string;
  initialVideo: boolean;
  initialAudio: boolean;
  autoPilot: boolean;
  onLeave: () => void;
}

const AI_QUESTIONS = [
  "Welcome! Thank you for joining today's technical round. Let's start with a brief introduction of yourself, your journey as a developer, and some of the projects you've built recently.",
  "Excellent. Let's dive into React. How do you approach state management in a large-scale application? When would you choose React Context vs. Redux vs. Zustand?",
  "Great insights. Speaking of builds, how would you optimize Vite page load and bundle sizes for a heavy dashboard application?",
  "Let's discuss reliability and user experience. How do you implement Error Boundaries and Lazy Loading to keep the application resilient?",
  "Perfect. Those are all the technical questions I have. Do you have any questions for me about the team, the company, or the position before we wrap up?"
];

export function MeetingRoom({ meetId, displayName, initialVideo, initialAudio, autoPilot, onLeave }: MeetingRoomProps) {
  // Call States
  const [videoEnabled, setVideoEnabled] = useState(initialVideo);
  const [audioEnabled, setAudioEnabled] = useState(initialAudio);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  // Connection and Room States
  const [peers, setPeers] = useState<string[]>([]); // Usernames of other peers
  const [showChat, setShowChat] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  // AI Mock Interviewer States
  const [aiActive, setAiActive] = useState(false);
  const [aiQuestionIndex, setAiQuestionIndex] = useState(0);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  // Active Speaker States (Audio Analysis)
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const joinTimeRef = useRef<number>(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const aiSpeakingTimeoutRef = useRef<any>(null);
  const autoPilotStartedRef = useRef(false);

  // Add system message utility
  const addSystemMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        sender: 'System',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'system'
      }
    ]);
  };

  // Recording Hook integration
  const { 
    isRecording, 
    recordingTimeText, 
    startRecording, 
    stopRecording 
  } = useRecording({ meetId, onSystemMessage: addSystemMessage });

  // Initialize Web Audio API for Local active speaker detection
  useEffect(() => {
    if (!localStream || !audioEnabled) {
      setIsLocalSpeaking(false);
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      
      const source = audioContext.createMediaStreamSource(localStream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      audioAnalyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!audioAnalyserRef.current) return;
        audioAnalyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Speaking threshold
        setIsLocalSpeaking(average > 15);
        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Could not initialize AudioContext for speaker detection', e);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [localStream, audioEnabled]);

  // Setup local stream
  useEffect(() => {
    async function initLocalStream() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoEnabled ? { width: 640, height: 360 } : false,
          audio: true, // Always request audio track but mute if needed
        });
        
        // Apply initial mic mute settings
        stream.getAudioTracks().forEach(track => {
          track.enabled = audioEnabled;
        });

        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error getting local stream:', err);
        addSystemMessage('Failed to access camera/mic. Connection might be audio-only.');
      }
    }

    initLocalStream();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Update track state if toggled during the call
  useEffect(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = videoEnabled;
      });
    }
  }, [videoEnabled]);

  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = audioEnabled;
      });
    }
  }, [audioEnabled]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping]);

  // WebRTC & WebSocket signaling setup
  useEffect(() => {
    if (!localStream) return;

    const wsUrl = `ws://localhost:8000/api/ws/meet/${meetId}?username=${encodeURIComponent(displayName)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      addSystemMessage('Connected to signaling server.');
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log('WS Message received:', data.type);

      switch (data.type) {
        case 'peer-joined':
          addSystemMessage(`${data.sender} joined the meeting.`);
          setPeers((prev) => [...prev, data.sender]);
          // Initiator creates WebRTC Offer
          initiateWebRTCCall();
          break;

        case 'peer-left':
          addSystemMessage(`${data.sender} left the meeting.`);
          setPeers((prev) => prev.filter((p) => p !== data.sender));
          setRemoteStream(null);
          // Close WebRTC peer connection
          if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
          }
          break;

        case 'offer':
          await handleOffer(data.offer);
          break;

        case 'answer':
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
          break;

        case 'candidate':
          if (pcRef.current) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (err) {
              console.error('Error adding ICE candidate:', err);
            }
          }
          break;

        case 'chat-message':
          setMessages((prev) => [
            ...prev,
            {
              id: Math.random().toString(),
              sender: data.sender,
              text: data.text,
              timestamp: data.timestamp,
              type: 'remote'
            }
          ]);
          break;

        default:
          break;
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      addSystemMessage('Signaling connection error.');
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      addSystemMessage('Disconnected from signaling server.');
    };

    return () => {
      ws.close();
    };
  }, [localStream, meetId, displayName]);

  // WebRTC Call Initiation
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Add local tracks to peer connection
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle remote track
    pc.ontrack = (event) => {
      console.log('Remote stream track received');
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'candidate',
          candidate: event.candidate
        }));
      }
    };

    pcRef.current = pc;
    return pc;
  };

  const initiateWebRTCCall = async () => {
    // Check if we are running solo interviewer mode, in which case WebRTC is not initialized
    if (aiActive) return;

    console.log('Creating WebRTC Offer...');
    const pc = createPeerConnection();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'offer',
          offer: offer
        }));
      }
    } catch (err) {
      console.error('Error creating Offer:', err);
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    if (aiActive) return;

    console.log('Handling WebRTC Offer...');
    const pc = createPeerConnection();
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'answer',
          answer: answer
        }));
      }
    } catch (err) {
      console.error('Error handling Offer & creating Answer:', err);
    }
  };

  // AI Interviewer Action Handlers
  const handleSimulateAI = () => {
    if (aiActive) return;
    
    // Close other peer connections if active
    if (remoteStream) setRemoteStream(null);
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setAiActive(true);
    addSystemMessage('AI Mock Peer connected.');
    
    // Trigger welcome question
    const firstQuestion = AI_QUESTIONS[0];
    setIsAiTyping(true);
    
    setTimeout(() => {
      setIsAiTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: 'AI Interviewer',
          text: firstQuestion,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'remote'
        }
      ]);
      setAiQuestionIndex(1);
      triggerAISpeaking(6000);
    }, 2000);
  };

  const triggerAISpeaking = (durationMs: number) => {
    if (aiSpeakingTimeoutRef.current) clearTimeout(aiSpeakingTimeoutRef.current);
    setIsAiSpeaking(true);
    aiSpeakingTimeoutRef.current = setTimeout(() => {
      setIsAiSpeaking(false);
    }, durationMs);
  };

  // Auto-Pilot automated startup sequence
  useEffect(() => {
    if (autoPilot && localStream && !autoPilotStartedRef.current) {
      autoPilotStartedRef.current = true;
      addSystemMessage('Auto-Pilot: Automatic call startup initiated.');
      
      const timer = setTimeout(() => {
        startRecording(localStream);
        handleSimulateAI();
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [localStream, autoPilot]);

  // Sending Chat message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: Message = {
      id: Math.random().toString(),
      sender: displayName,
      text: chatInput,
      timestamp: timestamp,
      type: 'user'
    };

    // Add to local messages list
    setMessages((prev) => [...prev, userMessage]);

    // Send through WebSocket to other human client
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !aiActive) {
      wsRef.current.send(JSON.stringify({
        type: 'chat-message',
        sender: displayName,
        text: chatInput,
        timestamp: timestamp
      }));
    }

    setChatInput('');

    // Trigger AI response if simulation is active
    if (aiActive && aiQuestionIndex < AI_QUESTIONS.length) {
      setIsAiTyping(true);
      
      setTimeout(() => {
        setIsAiTyping(false);
        const nextQuestion = AI_QUESTIONS[aiQuestionIndex];
        
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            sender: 'AI Interviewer',
            text: nextQuestion,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'remote'
          }
        ]);
        
        setAiQuestionIndex((prev) => prev + 1);
        triggerAISpeaking(7000);
      }, 2000); // 2 seconds delay
    } else if (aiActive && aiQuestionIndex >= AI_QUESTIONS.length) {
      // Out of preset questions
      setIsAiTyping(true);
      setTimeout(() => {
        setIsAiTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            sender: 'AI Interviewer',
            text: `Thank you ${displayName}. I have completed all my questions. I appreciate your detailed answers! The interview session will now close automatically.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'remote'
          }
        ]);
        triggerAISpeaking(5000);

        if (autoPilot) {
          addSystemMessage('Auto-Pilot: Interview finished. Saving progress and exiting call in 6 seconds...');
          setTimeout(() => {
            handleLeaveCall();
          }, 6000);
        }
      }, 2000);
    }
  };

  // Leave Call & Save Attendance
  const handleLeaveCall = async () => {
    // 1. Stop recording if it is active
    if (isRecording) {
      stopRecording();
    }

    const durationSeconds = Math.floor((Date.now() - joinTimeRef.current) / 1000);
    
    // 2. Post attendance details
    try {
      await fetch(`http://localhost:8000/api/meetings/${meetId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Attended',
          duration: durationSeconds
        })
      });
    } catch (e) {
      console.error('Error saving attendance:', e);
    }

    // 3. Clear local camera tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    // 4. Leave room route back
    onLeave();
  };

  const handleRecordingToggle = () => {
    if (isRecording) {
      stopRecording();
    } else if (localStream) {
      startRecording(localStream);
    }
  };

  // Determine streaming layout
  // Single-stream if only local, dual-stream if remote or AI active
  const isDualMode = remoteStream !== null || aiActive;

  return (
    <div className="room-container">
      {/* Room Header */}
      <div className="room-header">
        <div className="room-title-section">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Room: {meetId}</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>|</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>User: {displayName}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {autoPilot && (
            <div className="glass-panel" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              background: 'rgba(16, 185, 129, 0.15)', 
              borderColor: 'var(--success)', 
              color: 'var(--success)', 
              padding: '6px 12px', 
              borderRadius: '20px', 
              fontSize: '0.8rem', 
              fontWeight: 600,
              boxShadow: '0 0 10px rgba(16, 185, 129, 0.2)' 
            }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', animation: 'rec-pulse 1.5s infinite' }} />
              Auto-Pilot Active
            </div>
          )}

          {isRecording && (
            <div className="recording-timer">
              <div className="recording-dot rec-pulse-icon" />
              <span>REC {recordingTimeText}</span>
            </div>
          )}
          
          {!aiActive && !remoteStream && (
            <button 
              className="btn-primary" 
              onClick={handleSimulateAI}
              style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, var(--success), #059669)' }}
            >
              <Cpu size={14} /> Simulate Interviewer (AI Mock Peer)
            </button>
          )}
        </div>
      </div>

      {/* Room Body */}
      <div className="room-body">
        
        {/* Videos Grid */}
        <div className="video-grid-wrapper">
          <div className={`video-grid ${isDualMode ? 'dual-stream' : 'single-stream'}`}>
            
            {/* Local Stream Card */}
            <div className={`stream-card ${isLocalSpeaking ? 'active-speaker' : ''}`}>
              {videoEnabled && localStream ? (
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="stream-video" 
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', background: '#090d16', color: 'var(--text-muted)' }}>
                  <VideoOff size={40} style={{ marginBottom: '12px' }} />
                  <span style={{ fontSize: '0.9rem' }}>Camera turned off</span>
                </div>
              )}
              <div className="stream-badge">
                <span>{displayName} (You)</span>
                {!audioEnabled && <MicOff size={14} className="mic-status-icon" />}
              </div>
            </div>

            {/* Remote WebRTC Stream Card OR AI Simulated Avatar Card */}
            {isDualMode && (
              aiActive ? (
                /* AI Simulated Peer Card */
                <div className={`stream-card ${isAiSpeaking ? 'active-speaker' : ''}`} style={{ borderColor: isAiSpeaking ? 'var(--success)' : 'var(--glass-border)' }}>
                  <div className="ai-avatar-card">
                    <div className="ai-glow-ring" style={{ boxShadow: isAiSpeaking ? '0 0 30px var(--success-glow)' : 'none' }}>
                      <span className="ai-initials">AR</span>
                    </div>
                    <div className="speech-wave">
                      <div className={`wave-bar ${isAiSpeaking ? 'speaking' : ''}`} />
                      <div className={`wave-bar ${isAiSpeaking ? 'speaking' : ''}`} />
                      <div className={`wave-bar ${isAiSpeaking ? 'speaking' : ''}`} />
                      <div className={`wave-bar ${isAiSpeaking ? 'speaking' : ''}`} />
                      <div className={`wave-bar ${isAiSpeaking ? 'speaking' : ''}`} />
                      <div className={`wave-bar ${isAiSpeaking ? 'speaking' : ''}`} />
                      <div className={`wave-bar ${isAiSpeaking ? 'speaking' : ''}`} />
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={12} /> AI Speech Wavebars
                    </span>
                  </div>
                  <div className="stream-badge">
                    <span>AI Interviewer (Peer)</span>
                  </div>
                </div>
              ) : (
                /* Remote Peer WebRTC Card */
                <div className="stream-card">
                  {remoteStream ? (
                    <video 
                      ref={remoteVideoRef} 
                      autoPlay 
                      playsInline 
                      className="stream-video remote" 
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#090d16', color: 'var(--text-muted)' }}>
                      <VideoOff size={40} style={{ marginBottom: '12px' }} />
                      <span style={{ fontSize: '0.9rem' }}>Waiting for peer stream...</span>
                    </div>
                  )}
                  <div className="stream-badge">
                    <span>{peers[0] || 'Remote Peer'}</span>
                  </div>
                </div>
              )
            )}

          </div>
        </div>

        {/* Live Chat Sidebar */}
        <div className={`chat-sidebar ${!showChat ? 'hidden' : ''}`}>
          <div className="chat-header">
            <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} className="text-primary" /> Live Chat
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{messages.length} messages</span>
          </div>

          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.type}`}>
                <div className="msg-bubble">
                  {msg.text}
                </div>
                <div className="msg-meta">
                  <span style={{ fontWeight: 600 }}>{msg.sender}</span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>
              </div>
            ))}

            {isAiTyping && (
              <div className="chat-message remote">
                <div className="msg-bubble" style={{ padding: '4px 12px' }}>
                  <div className="typing-indicator">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
                <div className="msg-meta">
                  <span style={{ fontWeight: 600 }}>AI Interviewer</span>
                  <span>is typing...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="chat-input-bar">
            <input 
              type="text" 
              placeholder="Send message to room..." 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button type="submit" className="chat-send-btn">
              <Send size={16} />
            </button>
          </form>
        </div>

      </div>

      {/* Bottom Control Toolbar */}
      <div className="room-toolbar">
        <div className="toolbar-controls">
          <button 
            onClick={() => setAudioEnabled(!audioEnabled)} 
            className={`toolbar-btn ${!audioEnabled ? 'active-danger' : ''}`}
            title={audioEnabled ? 'Mute Mic' : 'Unmute Mic'}
          >
            {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          <button 
            onClick={() => setVideoEnabled(!videoEnabled)} 
            className={`toolbar-btn ${!videoEnabled ? 'active-danger' : ''}`}
            title={videoEnabled ? 'Stop Video' : 'Start Video'}
          >
            {videoEnabled ? <VideoIcon size={20} /> : <VideoOff size={20} />}
          </button>

          <button 
            onClick={handleRecordingToggle} 
            className={`toolbar-btn ${isRecording ? 'recording-active' : ''}`}
            title={isRecording ? 'Stop Recording' : 'Start Recording'}
            style={{ borderRadius: '50%' }}
          >
            {isRecording ? (
              <div style={{ width: '14px', height: '14px', borderRadius: '2px', background: 'var(--danger)' }} />
            ) : (
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'var(--danger)' }} />
            )}
          </button>

          <button 
            onClick={handleLeaveCall} 
            className="btn-leave"
            title="Leave Meeting"
          >
            <PhoneOff size={18} /> Leave Call
          </button>
        </div>

        <div className="toolbar-right">
          <button 
            onClick={() => setShowChat(!showChat)} 
            className={`toolbar-btn ${showChat ? 'active-primary' : ''}`}
            title={showChat ? 'Hide Chat' : 'Show Chat'}
          >
            <MessageSquare size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
