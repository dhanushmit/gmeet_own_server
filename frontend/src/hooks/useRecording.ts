import { useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';

interface UseRecordingProps {
  meetId: string;
  onSystemMessage: (text: string) => void;
}

export function useRecording({ meetId, onSystemMessage }: UseRecordingProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = (stream: MediaStream) => {
    if (!stream) {
      console.error('Cannot start recording: stream is null');
      return;
    }
    
    try {
      chunksRef.current = [];
      const options = { mimeType: 'video/webm;codecs=vp9,opus' };
      let recorder: MediaRecorder;
      
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        console.warn('VP9 codec not supported, trying default codecs');
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        if (blob.size === 0) {
          console.warn('Recorded blob is empty.');
          return;
        }
        await uploadRecordingBlob(blob);
      };

      // Start recording and collect chunks every 1s
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      onSystemMessage('Call recording started.');
    } catch (err) {
      console.error('Error starting MediaRecorder:', err);
      onSystemMessage('Failed to start recording.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setIsRecording(false);
    onSystemMessage('Recording stopped. Compiling and uploading video stream...');
  };

  const uploadRecordingBlob = async (blob: Blob) => {
    const formData = new FormData();
    formData.append('file', blob, `recording_${meetId}.webm`);

    try {
      const response = await fetch(`${API_URL}/api/meetings/${meetId}/upload-recording`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        onSystemMessage('Recording uploaded successfully. Meeting marked as Completed.');
      } else {
        const errorData = await response.json().catch(() => ({}));
        onSystemMessage(`Failed to upload recording: ${errorData.detail || response.statusText}`);
      }
    } catch (err) {
      console.error('Error uploading recording:', err);
      onSystemMessage('Network error uploading recording to server.');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    isRecording,
    recordingTimeText: formatTime(recordingTime),
    recordingDurationSeconds: recordingTime,
    startRecording,
    stopRecording,
  };
}
