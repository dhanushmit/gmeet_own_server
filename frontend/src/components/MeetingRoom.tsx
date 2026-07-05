import React, { useState, useEffect, useRef } from 'react';
import type { Message } from '../types';
import { API_URL, WS_URL } from '../config';
import { useRecording } from '../hooks/useRecording';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  MessageSquare, PhoneOff, Send, Cpu, Sparkles, Check, X, ShieldAlert, Clock 
} from 'lucide-react';

interface MeetingRoomProps {
  meetId: string;
  displayName: string;
  initialVideo: boolean;
  initialAudio: boolean;
  autoPilot: boolean;
  role: 'admin' | 'candidate';
  onLeave: () => void;
}

const AI_QUESTIONS = [
  "Welcome! Thank you for joining today's technical round. Let's start with a brief introduction of yourself, your journey as a developer, and some of the projects you've built recently.",
  "Excellent. Let's dive into React. How do you approach state management in a large-scale application? When would you choose React Context vs. Redux vs. Zustand?",
  "Great insights. Speaking of builds, how would you optimize Vite page load and bundle sizes for a heavy dashboard application?",
  "Let's discuss reliability and user experience. How do you implement Error Boundaries and Lazy Loading to keep the application resilient?",
  "Perfect. Those are all the technical questions I have. Do you have any questions for me about the team, the company, or the position before we wrap up?"
];

interface RemoteVideoProps {
  stream: MediaStream;
}

function RemoteVideo({ stream }: RemoteVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.error("Error playing remote video:", err);
      });
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="stream-video remote"
    />
  );
}

export function MeetingRoom({ meetId, displayName, initialVideo, initialAudio, autoPilot, role, onLeave }: MeetingRoomProps) {
  // Call States
  const [videoEnabled, setVideoEnabled] = useState(initialVideo);
  const [audioEnabled, setAudioEnabled] = useState(initialAudio);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{ [username: string]: MediaStream }>({});
  
  // Connection and Room States
  const [isAdmitted, setIsAdmitted] = useState(role === 'admin');
  const isAdmittedRef = useRef(isAdmitted);
  useEffect(() => {
    isAdmittedRef.current = isAdmitted;
  }, [isAdmitted]);
  const [waitingCandidates, setWaitingCandidates] = useState<string[]>([]);
  const transcriptRef = useRef<{ speaker: string; text: string; timestamp: string; elapsed_seconds?: number; average_volume?: number; speech_rate?: number }[]>([]);
  const speakingVolumesRef = useRef<number[]>([]);
  const speechStartRef = useRef<number>(0);
  const addTranscriptLine = (speaker: string, text: string, elapsed?: number, volume?: number, rate?: number) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const elapsedSeconds = elapsed !== undefined ? elapsed : (joinTimeRef.current ? Math.floor((Date.now() - joinTimeRef.current) / 1000) : 0);
    const newLine = { 
      speaker, 
      text, 
      timestamp, 
      elapsed_seconds: elapsedSeconds,
      average_volume: volume !== undefined ? volume : 20,
      speech_rate: rate !== undefined ? rate : 2.5
    };
    transcriptRef.current = [...transcriptRef.current, newLine];
  };
  const [isKickedOut, setIsKickedOut] = useState(false);
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
  const wsRef = useRef<WebSocket | null>(null);
  const pcsRef = useRef<{ [username: string]: RTCPeerConnection }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const joinTimeRef = useRef<number>(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const aiSpeakingTimeoutRef = useRef<any>(null);
  const autoPilotStartedRef = useRef(false);
  const isWaitingForUploadRef = useRef(false);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingSourcesMapRef = useRef<{ [trackId: string]: MediaStreamAudioSourceNode }>({});
  const recordingOscillatorRef = useRef<OscillatorNode | null>(null);

  const connectTrackToRecording = (track: MediaStreamTrack, peerUsername: string) => {
    if (!recordingAudioContextRef.current || !recordingDestRef.current) return;
    if (track.kind !== 'audio') return;

    const trackId = `${peerUsername}-${track.id}`;
    if (recordingSourcesMapRef.current[trackId]) return; // already connected

    try {
      console.log(`Dynamically connecting audio track from ${peerUsername} to active recording...`);
      const audioSource = recordingAudioContextRef.current.createMediaStreamSource(new MediaStream([track]));
      audioSource.connect(recordingDestRef.current);
      recordingSourcesMapRef.current[trackId] = audioSource;
    } catch (err) {
      console.warn(`Failed to dynamically connect track from ${peerUsername} to recording`, err);
    }
  };

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
  } = useRecording({ 
    meetId, 
    onSystemMessage: addSystemMessage,
    onUploadComplete: () => {
      if (isWaitingForUploadRef.current) {
        console.log("Recording upload completed. Redirecting to dashboard...");
        onLeave();
      }
    }
  });

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
        
        // Track local speaking volumes history and start time
        if (average > 15) {
          if (speakingVolumesRef.current.length === 0) {
            speechStartRef.current = Date.now();
          }
          speakingVolumesRef.current.push(average);
        }
        
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
    let activeStream: MediaStream | null = null;
    async function initLocalStream() {
      try {
        // Always request both video and audio tracks to allow toggling them dynamically during the call
        // Apply WebRTC noiseSuppression, echoCancellation, and autoGainControl for clean noise-free sound
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360 },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
        });
        
        activeStream = stream;

        // Apply initial configurations
        stream.getVideoTracks().forEach(track => {
          track.enabled = videoEnabled;
        });
        stream.getAudioTracks().forEach(track => {
          track.enabled = audioEnabled;
        });

        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error getting local stream:', err);
        // Fallback to audio-only if camera is blocked/unavailable
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ 
            video: false, 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            } 
          });
          activeStream = audioStream;
          audioStream.getAudioTracks().forEach(track => {
            track.enabled = audioEnabled;
          });
          setLocalStream(audioStream);
        } catch (audioErr) {
          console.error('Error getting fallback audio stream:', audioErr);
          addSystemMessage('Failed to access camera/mic.');
        }
      }
    }

    initLocalStream();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Keep local video element in sync with localStream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(err => {
        console.error("Error playing local video:", err);
      });
    }
  }, [localStream, videoEnabled, isAdmitted]);



  // Update track state if toggled during the call
  useEffect(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = videoEnabled;
      });
    }
  }, [videoEnabled, localStream]);

  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = audioEnabled;
      });
    }
  }, [audioEnabled, localStream]);

  // Speech-to-Text Transcription Setup
  const recognitionRef = useRef<any>(null);
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech Recognition API not supported in this browser.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    
    // Support en-IN to optimize capturing Indian English accents with maximum accuracy, fallback to navigator.language
    const userLang = navigator.language || 'en-IN';
    rec.lang = userLang.startsWith('en') ? 'en-IN' : userLang;

    rec.onresult = (event: any) => {
      // Loop through all new results to ensure no speech chunks are lost (solves empty/skipped chunks)
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const transcriptText = event.results[i][0].transcript.trim();
          
          if (transcriptText) {
            console.log("Transcribed speech chunk:", transcriptText);
            
            // Calculate voice features
            const vols = speakingVolumesRef.current;
            const avgVol = vols.length > 0 ? (vols.reduce((a, b) => a + b, 0) / vols.length) : 20;
            
            const durationSec = speechStartRef.current > 0 ? (Date.now() - speechStartRef.current) / 1000 : 1.5;
            const wordCount = transcriptText.split(/\s+/).length;
            const speechRate = durationSec > 0.5 ? (wordCount / durationSec) : (wordCount / 1.5);
            
            // Reset refs
            speakingVolumesRef.current = [];
            speechStartRef.current = 0;

            addTranscriptLine(displayName, transcriptText, undefined, avgVol, speechRate);

            // Broadcast to peer
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              const elapsed = joinTimeRef.current ? Math.floor((Date.now() - joinTimeRef.current) / 1000) : 0;
              wsRef.current.send(JSON.stringify({
                type: 'transcript-chunk',
                text: transcriptText,
                sender: displayName,
                elapsed_seconds: elapsed,
                average_volume: avgVol,
                speech_rate: speechRate
              }));
            }
          }
        }
      }
    };

    rec.onerror = (err: any) => {
      console.error("Speech Recognition error:", err.error);
      addSystemMessage("Speech capture warning: " + err.error);
      if (err.error === 'network' || err.error === 'aborted' || err.error === 'no-speech') {
        setTimeout(() => {
          try {
            if (isAdmittedRef.current && !isKickedOut) rec.start();
          } catch (e) {}
        }, 1000);
      }
    };

    rec.onend = () => {
      console.log("Speech Recognition session ended.");
      setTimeout(() => {
        try {
          if (isAdmittedRef.current && !isKickedOut) {
            rec.start();
          }
        } catch (e) {}
      }, 1000);
    };

    recognitionRef.current = rec;

    let restartInterval: any = null;
    if (isAdmitted && localStream && audioEnabled) {
      try {
        rec.start();
        console.log("Speech recognition started.");
        addSystemMessage("Speech capture active.");

        // Periodic restart to avoid browser SpeechRecognition freeze (keeps it highly responsive)
        restartInterval = setInterval(() => {
          try {
            console.log("Periodic restart of Speech Recognition...");
            rec.stop();
          } catch (e) {}
        }, 45000); // 45 seconds
      } catch (e) {
        console.error("Error starting speech recognition:", e);
      }
    } else {
      console.log("Speech recognition suspended (muted or waiting).");
    }

    return () => {
      if (restartInterval) clearInterval(restartInterval);
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, [isAdmitted, localStream, audioEnabled]);

  // Auto-start recording on admin join
  useEffect(() => {
    if (role === 'admin' && isAdmitted && localStream && !isRecording) {
      console.log("Admin entered meeting room: auto-starting recording...");
      const mixedStream = getMixedMeetingStream();
      if (mixedStream) {
        startRecording(mixedStream);
      }
    }
  }, [isAdmitted, localStream, role, isRecording]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping]);

  // WebRTC & WebSocket signaling setup
  useEffect(() => {
    if (!localStream) return;

    const wsUrl = `${WS_URL}/api/ws/meet/${meetId}?username=${encodeURIComponent(displayName)}&role=${role}`;
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
        case 'waiting-state':
          setIsAdmitted(false);
          break;

        case 'waiting-list':
          setWaitingCandidates(data.candidates || []);
          break;

        case 'admit-success':
          setIsAdmitted(true);
          addSystemMessage('You have been admitted to the interview by the Host.');
          break;

        case 'kick-out':
          setIsKickedOut(true);
          if (localStream) {
            localStream.getTracks().forEach((track) => track.stop());
          }
          break;

        case 'peer-joined':
          if (data.sender === displayName) break;
          addSystemMessage(`${data.sender} joined the meeting.`);
          setPeers((prev) => prev.includes(data.sender) ? prev : [...prev, data.sender]);
          if (isAdmittedRef.current) {
            initiateWebRTCCall(data.sender);
          }
          break;

        case 'peer-left':
          if (data.sender === displayName) break;
          addSystemMessage(`${data.sender} left the meeting.`);
          setPeers((prev) => prev.filter((p) => p !== data.sender));
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[data.sender];
            return next;
          });
          if (pcsRef.current[data.sender]) {
            pcsRef.current[data.sender].close();
            delete pcsRef.current[data.sender];
          }
          break;

        case 'meeting-ended':
          addSystemMessage('The host has ended this meeting.');
          setTimeout(() => {
            handleLeaveCall();
          }, 2000);
          break;

        case 'offer':
          if (isAdmittedRef.current && data.target === displayName) {
            await handleOffer(data.offer, data.sender);
          }
          break;

        case 'answer':
          if (isAdmittedRef.current && data.target === displayName) {
            const pc = pcsRef.current[data.sender];
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
          }
          break;

        case 'candidate':
          if (isAdmittedRef.current && data.target === displayName) {
            const pc = pcsRef.current[data.sender];
            if (pc) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (err) {
                console.error(`Error adding ICE candidate from ${data.sender}:`, err);
              }
            }
          }
          break;

        case 'transcript-chunk':
          console.log("Received remote transcript chunk:", data.text);
          addTranscriptLine(data.sender, data.text, data.elapsed_seconds, data.average_volume, data.speech_rate);
          break;

        case 'chat-message':
          if (isAdmittedRef.current) {
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
          }
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
      Object.keys(pcsRef.current).forEach((key) => {
        try {
          pcsRef.current[key].close();
        } catch (err) {}
      });
      pcsRef.current = {};
    };
  }, [localStream, meetId, displayName]);

  // WebRTC Call Initiation
  const createPeerConnection = (targetUsername: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    (pc as any).peerUsername = targetUsername;

    // Add local tracks to peer connection
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle remote track
    pc.ontrack = (event) => {
      console.log(`Remote stream track received from ${targetUsername}`);
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        setRemoteStreams((prev) => ({
          ...prev,
          [targetUsername]: stream
        }));
        
        // Dynamically connect any new audio tracks to recording if active
        stream.getAudioTracks().forEach((track) => {
          connectTrackToRecording(track, targetUsername);
        });
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'candidate',
          candidate: event.candidate,
          sender: displayName,
          target: targetUsername
        }));
      }
    };

    pcsRef.current[targetUsername] = pc;
    return pc;
  };

  const initiateWebRTCCall = async (targetUsername: string) => {
    if (aiActive || !isAdmittedRef.current) return;

    console.log(`Creating WebRTC Offer for ${targetUsername}...`);
    const pc = createPeerConnection(targetUsername);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'offer',
          offer: offer,
          sender: displayName,
          target: targetUsername
        }));
      }
    } catch (err) {
      console.error(`Error creating Offer for ${targetUsername}:`, err);
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit, senderUsername: string) => {
    if (aiActive || !isAdmittedRef.current) return;

    console.log(`Handling WebRTC Offer from ${senderUsername}...`);
    if (pcsRef.current[senderUsername]) {
      try {
        pcsRef.current[senderUsername].close();
      } catch (err) {}
    }
    const pc = createPeerConnection(senderUsername);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'answer',
          answer: answer,
          sender: displayName,
          target: senderUsername
        }));
      }
    } catch (err) {
      console.error(`Error handling Offer & creating Answer for ${senderUsername}:`, err);
    }
  };

  // Admin Host Action Handlers
  const handleAdmitCandidate = (targetName: string) => {
    console.log('Admitting candidate:', targetName);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'admit-peer',
        target: targetName
      }));
    } else {
      console.error('Signaling WebSocket is not open.');
    }
  };

  const handleRemoveCandidate = (targetName: string) => {
    console.log('Removing candidate:', targetName);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'remove-peer',
        target: targetName
      }));
    } else {
      console.error('Signaling WebSocket is not open.');
    }
  };

  // AI Interviewer Action Handlers
  const handleSimulateAI = () => {
    if (aiActive) return;
    
    // Close other peer connections if active
    setRemoteStreams({});
    Object.keys(pcsRef.current).forEach((key) => {
      try {
        pcsRef.current[key].close();
      } catch (err) {}
    });
    pcsRef.current = {};

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
      
      addTranscriptLine('AI Interviewer', firstQuestion);
      
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
        
        addTranscriptLine('AI Interviewer', nextQuestion);
        
        setAiQuestionIndex((prev) => prev + 1);
        triggerAISpeaking(7000);
      }, 2000); // 2 seconds delay
    } else if (aiActive && aiQuestionIndex >= AI_QUESTIONS.length) {
      // Out of preset questions
      setIsAiTyping(true);
      setTimeout(() => {
        setIsAiTyping(false);
        const completionText = `Thank you ${displayName}. I have completed all my questions. I appreciate your detailed answers! The interview session will now close automatically.`;
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            sender: 'AI Interviewer',
            text: completionText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'remote'
          }
        ]);
        
        addTranscriptLine('AI Interviewer', completionText);
        
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

  // Leave Call & Save Attendance & Transcript
  const handleLeaveCall = async () => {
    let needsToWait = false;
    
    // 1. Stop recording if it is active
    if (isRecording) {
      console.log("Stopping recording and preparing file upload...");
      needsToWait = true;
      isWaitingForUploadRef.current = true;
      stopRecording();
    }

    if (recordingOscillatorRef.current) {
      try {
        recordingOscillatorRef.current.stop();
      } catch (e) {}
      recordingOscillatorRef.current = null;
    }

    if (recordingAudioContextRef.current) {
      try {
        recordingAudioContextRef.current.close();
      } catch (e) {}
      recordingAudioContextRef.current = null;
    }
    recordingDestRef.current = null;
    recordingSourcesMapRef.current = {};

    const durationSeconds = Math.floor((Date.now() - joinTimeRef.current) / 1000);
    
    // 2. Post attendance and transcript details depending on role
    if (role === 'admin') {
      try {
        console.log('Ending meeting and saving transcript logs...');
        
        // Notify others that meeting has ended
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'meeting-ended',
            sender: displayName
          }));
        }

        await fetch(`${API_URL}/api/meetings/${meetId}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attendance_duration: durationSeconds,
            transcript: transcriptRef.current
          })
        });
      } catch (e) {
        console.error('Error saving final logs and transcript:', e);
      }
    } else {
      // Candidates save their own attendance logs
      try {
        await fetch(`${API_URL}/api/meetings/${meetId}/attendance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'Attended',
            duration: durationSeconds
          })
        });
      } catch (err) {
        console.error('Candidate attendance update failed:', err);
      }
    }

    // 3. Clear local camera tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    // 4. Close all WebRTC peer connections
    Object.keys(pcsRef.current).forEach((key) => {
      try {
        pcsRef.current[key].close();
      } catch (err) {}
    });
    pcsRef.current = {};

    // 5. Leave room route back only if we do not need to wait for upload
    if (!needsToWait) {
      onLeave();
    } else {
      addSystemMessage("Saving recording to server. Please do not close this window...");
    }
  };

  const getMixedMeetingStream = () => {
    if (!localStream) return null;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      
      // Resume context to avoid suspension
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const dest = audioContext.createMediaStreamDestination();
      
      recordingAudioContextRef.current = audioContext;
      recordingDestRef.current = dest;
      recordingSourcesMapRef.current = {};

      // 1. Add a constant inaudible keep-alive oscillator signal to force MediaRecorder to write video frames immediately
      try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.000001; // completely inaudible
        oscillator.connect(gainNode);
        gainNode.connect(dest);
        oscillator.start();
        recordingOscillatorRef.current = oscillator;
      } catch (err) {
        console.warn("Could not create keep-alive oscillator", err);
      }

      // 2. Connect local audio if it exists (regardless of enabled/disabled state)
      const localAudioTracks = localStream.getAudioTracks();
      if (localAudioTracks.length > 0) {
        try {
          const localSource = audioContext.createMediaStreamSource(new MediaStream([localAudioTracks[0]]));
          localSource.connect(dest);
          recordingSourcesMapRef.current[`local-${localAudioTracks[0].id}`] = localSource;
        } catch (err) {
          console.warn("Could not connect local microphone to recording", err);
        }
      }

      // 3. Connect all existing remote audio streams
      Object.keys(remoteStreams).forEach((peerUsername) => {
        const remoteStr = remoteStreams[peerUsername];
        remoteStr.getAudioTracks().forEach((track) => {
          connectTrackToRecording(track, peerUsername);
        });
      });

      // 4. Combine original video track with mixed audio track (avoiding stream clone frame freezes)
      const combinedTracks: MediaStreamTrack[] = [];
      
      const localVideoTracks = localStream.getVideoTracks();
      if (localVideoTracks.length > 0) {
        combinedTracks.push(localVideoTracks[0]); // original video track keeps frames active
      }
      
      const mixedAudioTracks = dest.stream.getAudioTracks();
      if (mixedAudioTracks.length > 0) {
        combinedTracks.push(mixedAudioTracks[0]);
      }

      return new MediaStream(combinedTracks);
    } catch (e) {
      console.error("Error creating mixed audio stream for recording:", e);
      return localStream; // Fallback to local only
    }
  };

  const handleRecordingToggle = () => {
    if (isRecording) {
      stopRecording();
      if (recordingOscillatorRef.current) {
        try {
          recordingOscillatorRef.current.stop();
        } catch (e) {}
        recordingOscillatorRef.current = null;
      }
      if (recordingAudioContextRef.current) {
        try {
          recordingAudioContextRef.current.close();
        } catch (e) {}
          recordingAudioContextRef.current = null;
      }
      recordingDestRef.current = null;
      recordingSourcesMapRef.current = {};
    } else {
      const mixedStream = getMixedMeetingStream();
      if (mixedStream) {
        startRecording(mixedStream);
      }
    }
  };

  // Determine streaming layout
  // Single-stream if only local, dual-stream if remote or AI active
  const remoteStreamKeys = Object.keys(remoteStreams);
  const isMultiStream = remoteStreamKeys.length > 1;
  const isDualMode = remoteStreamKeys.length === 1 || aiActive;

  if (isKickedOut) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#030712', color: '#fff', padding: '20px' }}>
        <div className="glass-panel" style={{ maxWidth: '440px', padding: '36px', textAlign: 'center', border: '1px solid var(--danger)' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto', color: 'var(--danger)' }}>
            <X size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '12px' }}>Removed from Room</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            You have been removed from the meeting by the Host, or your admission request was declined.
          </p>
          <button onClick={onLeave} className="btn-primary" style={{ width: '100%' }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmitted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#030712', overflow: 'hidden', position: 'fixed', top: 0, left: 0, zIndex: 100 }}>
        <div style={{ height: '60px', display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: '1px solid var(--glass-border)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Tech-Meet Waiting Lobby</h2>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '40px', flex: 1, padding: '40px', maxWidth: '1000px', margin: '0 auto', alignItems: 'center' }}>
          <div>
            <div className="camera-preview-box" style={{ borderRadius: '16px', border: '2px solid var(--glass-border)' }}>
              {videoEnabled && localStream ? (
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="camera-video"
                  style={{ transform: 'rotateY(180deg)' }}
                />
              ) : (
                <div className="camera-placeholder">
                  <VideoOff size={48} className="text-muted" />
                  <p>Camera is off while waiting</p>
                </div>
              )}
              
              <div className="preview-controls">
                <button 
                  onClick={() => setAudioEnabled(!audioEnabled)} 
                  className={`control-btn ${!audioEnabled ? 'active' : ''}`}
                  title={audioEnabled ? 'Mute' : 'Unmute'}
                >
                  {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <button 
                  onClick={() => setVideoEnabled(!videoEnabled)} 
                  className={`control-btn ${!videoEnabled ? 'active' : ''}`}
                  title={videoEnabled ? 'Stop Video' : 'Start Video'}
                >
                  {videoEnabled ? <VideoIcon size={20} /> : <VideoOff size={20} />}
                </button>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', borderLeft: '4px solid var(--warning)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', marginBottom: '20px' }}>
              <Clock size={28} className="rec-pulse-icon" />
            </div>
            
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '12px' }}>Waiting to Join...</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
              Hi <strong>{displayName}</strong>, we've notified the Host that you are waiting. Please wait a moment while they admit you.
            </p>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--warning)', animation: 'rec-pulse 1.5s infinite' }} />
              Connection Secure. Waiting for Host approval.
            </div>

            <button onClick={onLeave} className="btn-secondary" style={{ width: '100%', marginTop: '24px' }}>
              Cancel & Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          
          {!aiActive && Object.keys(remoteStreams).length === 0 && (
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
          <div className={`video-grid ${isMultiStream ? 'multi-stream' : isDualMode ? 'dual-stream' : 'single-stream'}`}>
            
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
            {aiActive ? (
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
              /* Remote Peer WebRTC Cards */
              peers.map((peerUsername) => {
                const stream = remoteStreams[peerUsername];
                return (
                  <div key={peerUsername} className="stream-card">
                    {stream ? (
                      <>
                        <RemoteVideo stream={stream} />
                        {role === 'admin' && (
                          <button
                            onClick={() => handleRemoveCandidate(peerUsername)}
                            className="btn-primary"
                            style={{
                              position: 'absolute',
                              top: '16px',
                              right: '16px',
                              padding: '6px 12px',
                              fontSize: '0.75rem',
                              background: 'var(--danger)',
                              boxShadow: 'none',
                              zIndex: 10,
                              borderRadius: '4px'
                            }}
                          >
                            Kick Candidate
                          </button>
                        )}
                      </>
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#090d16', color: 'var(--text-muted)' }}>
                        <VideoOff size={40} style={{ marginBottom: '12px' }} />
                        <span style={{ fontSize: '0.9rem' }}>Waiting for peer stream...</span>
                      </div>
                    )}
                    <div className="stream-badge">
                      <span>{peerUsername}</span>
                    </div>
                  </div>
                );
              })
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

          {/* Host Panel: Waiting Candidates list */}
          {role === 'admin' && waitingCandidates.length > 0 && (
            <div className="glass-panel" style={{ 
              padding: '16px', 
              margin: '16px 16px 0 16px', 
              background: 'rgba(245, 158, 11, 0.08)', 
              borderColor: 'rgba(245, 158, 11, 0.3)',
              borderRadius: '8px'
            }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <ShieldAlert size={14} /> Waiting Lobby ({waitingCandidates.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {waitingCandidates.map((candidateName) => (
                  <div key={candidateName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{candidateName}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        onClick={() => { console.log('Admitting', candidateName); handleAdmitCandidate(candidateName); }}
                        style={{ 
                          width: '38px', 
                          height: '38px', 
                          borderRadius: '50%', 
                          background: 'var(--success)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          color: '#fff', 
                          padding: 0,
                          border: 'none',
                          cursor: 'pointer',
                          touchAction: 'manipulation'
                        }}
                        title="Admit Candidate"
                      >
                        <Check size={18} />
                      </button>
                      <button 
                        onClick={() => { console.log('Removing', candidateName); handleRemoveCandidate(candidateName); }}
                        style={{ 
                          width: '38px', 
                          height: '38px', 
                          borderRadius: '50%', 
                          background: 'var(--danger)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          color: '#fff', 
                          padding: 0,
                          border: 'none',
                          cursor: 'pointer',
                          touchAction: 'manipulation'
                        }}
                        title="Remove Candidate"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
