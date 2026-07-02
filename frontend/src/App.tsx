import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Lobby } from './components/Lobby';
import { MeetingRoom } from './components/MeetingRoom';
import './App.css';

type ViewState = 'dashboard' | 'lobby' | 'room';

function App() {
  const [view, setView] = useState<ViewState>('dashboard');
  const [selectedMeetId, setSelectedMeetId] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [autoPilot, setAutoPilot] = useState<boolean>(false);

  const handleJoinMeeting = (meetId: string) => {
    setSelectedMeetId(meetId);
    setView('lobby');
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
          onBack={() => setView('dashboard')} 
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
