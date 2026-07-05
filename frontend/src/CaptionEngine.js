export default class CaptionEngine {
  constructor(socket, roomId, participantName, onTranscriptCallback, onInterimCallback) {
    this.socket = socket;
    this.roomId = roomId;
    this.participantName = participantName;
    this.onTranscript = onTranscriptCallback;
    this.onInterim = onInterimCallback;
    
    this.recognition = null;
    this.mediaRecorder = null;
    this.stream = null;
    this.lang = 'en-IN'; // default language
    this.isRecording = false;

    // Detect if we are on a mobile device
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  setLanguage(languageCode) {
    this.lang = languageCode;
    if (this.recognition) {
      this.recognition.lang = languageCode;
    }
  }

  async start(localStream) {
    if (this.isRecording) return;
    this.stream = localStream;
    this.isRecording = true;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    // Fall back to Whisper slice recorder on mobile or if SpeechRecognition is missing
    if (!SpeechRecognition || this.isMobile) {
      console.log('CaptionEngine: Initializing audio slice recorder fallback...');
      this.startFallbackRecording();
    } else {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = this.lang;

        this.recognition.onresult = (event) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const text = event.results[i][0].transcript.trim();
            if (event.results[i].isFinal) {
              if (text) {
                console.log('CaptionEngine: Finalized speech chunk:', text);
                
                // 1. Emit final caption to socket.io server
                this.socket.emit('caption', { text, isFinal: true });
                
                // 2. Fire local callback
                if (this.onTranscript) this.onTranscript(this.participantName, text);
              }
            } else {
              interimTranscript += text + ' ';
            }
          }

          if (interimTranscript.trim()) {
            const interimText = interimTranscript.trim();
            
            // Emit interim caption to socket.io server
            this.socket.emit('caption', { text: interimText, isFinal: false });
            
            // Fire local interim callback
            if (this.onInterim) this.onInterim(this.participantName, interimText);
          }
        };

        this.recognition.onerror = (event) => {
          console.error('CaptionEngine: Speech recognition error:', event.error);
          
          if (event.error === 'not-allowed' || event.error === 'audio-capture' || event.error === 'service-not-allowed') {
            console.warn('CaptionEngine: Microphone blocked or not allowed, switching to Whisper fallback...');
            this.stopRecognition();
            this.startFallbackRecording();
          }
        };

        this.recognition.onend = () => {
          if (this.isRecording && !this.mediaRecorder) {
            console.log('CaptionEngine: Speech recognition ended. Restarting...');
            try {
              this.recognition.start();
            } catch (e) {
              setTimeout(() => {
                if (this.isRecording && !this.mediaRecorder) {
                  try { this.recognition.start(); } catch (err) {}
                }
              }, 300);
            }
          }
        };

        this.recognition.start();
        console.log('CaptionEngine: Browser SpeechRecognition active.');
      } catch (err) {
        console.error('CaptionEngine: Failed to start SpeechRecognition. Switching to Whisper...', err);
        this.startFallbackRecording();
      }
    }
  }

  startFallbackRecording() {
    if (!this.stream || this.mediaRecorder) return;

    const audioTrack = this.stream.getAudioTracks()[0];
    if (!audioTrack) {
      console.error('CaptionEngine Fallback: No audio track found.');
      return;
    }

    try {
      const mediaStream = new MediaStream([audioTrack.clone()]);
      this.mediaRecorder = new MediaRecorder(mediaStream);

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0 && this.isRecording) {
          const audioBlob = event.data;
          const formData = new FormData();
          formData.append('file', audioBlob, 'chunk.wav');

          try {
            // Point to backend transcription API
            const res = await fetch('/api/meetings/transcribe-chunk', {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            const text = data.text?.trim();
            if (text) {
              console.log('CaptionEngine Fallback: Transcribed chunk:', text);
              this.socket.emit('caption', { text, isFinal: true });
              if (this.onTranscript) this.onTranscript(this.participantName, text);
            }
          } catch (err) {
            console.error('CaptionEngine Fallback: Transcription request failed:', err);
          }
        }
      };

      this.mediaRecorder.start(4000); // 4-second audio slices
      console.log('CaptionEngine Fallback: Slice recording started (4s).');
    } catch (e) {
      console.error('CaptionEngine Fallback: Failed to start MediaRecorder:', e);
    }
  }

  stop() {
    this.isRecording = false;
    this.stopRecognition();
    this.stopFallbackRecording();
  }

  stopRecognition() {
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      try {
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }
  }

  stopFallbackRecording() {
    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch (e) {}
      this.mediaRecorder = null;
    }
  }
}
