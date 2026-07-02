import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Lobby } from './components/Lobby';
import { MeetingRoom } from './components/MeetingRoom';
import './App.css';

type ViewState = 'dashboard' | 'lobby' | 'room';

function App() {
  // Simple path routing interceptor
  const path = window.location.pathname;
  const isMeetPath = path.startsWith('/meet/');
  const urlParams = new URLSearchParams(window.location.search);
  const queryMeetId = urlParams.get('meet');

  // Parse initial state from URL
  let initialView: ViewState = 'dashboard';
  let initialMeetId = '';
  
  if (isMeetPath) {
    initialMeetId = path.split('/meet/')[1] || '';
    if (initialMeetId) {
      initialView = 'lobby';
    }
  } else if (queryMeetId) {
    initialMeetId = queryMeetId;
    initialView = 'lobby';
  }

  const [view, setView] = useState<ViewState>(initialView);
  const [selectedMeetId, setSelectedMeetId] = useState<string>(initialMeetId);
  const [displayName, setDisplayName] = useState<string>('');
  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [autoPilot, setAutoPilot] = useState<boolean>(false);

  const handleJoinMeeting = (meetId: string) => {
    setSelectedMeetId(meetId);
    setView('lobby');
    window.history.pushState({}, '', `/meet/${meetId}`);
  };

  const handleLobbyJoin = (name: string, video: boolean, audio: boolean, auto: boolean) => {
    setDisplayName(name);
    setVideoEnabled(video);
    setAudioEnabled(audio);
    setAutoPilot(auto);
    setView('room');
  };

  const handleLeaveRoom = () => {
    setView('dashboard');
    setSelectedMeetId('');
    window.history.pushState({}, '', '/');
  };

  return (
    <>
      {view === 'dashboard' && (
        <Dashboard onJoinMeeting={handleJoinMeeting} />
      )}
      
      {view === 'lobby' && (
        <Lobby 
          meetId={selectedMeetId} 
          onJoin={handleLobbyJoin} 
          onBack={() => {
            setView('dashboard');
            window.history.pushState({}, '', '/');
          }}
        />
      )}
      
      {view === 'room' && (
        <MeetingRoom 
          meetId={selectedMeetId} 
          displayName={displayName} 
          initialVideo={videoEnabled} 
          initialAudio={audioEnabled} 
          autoPilot={autoPilot}
          onLeave={handleLeaveRoom} 
        />
      )}
    </>
  );
}

export default App;
