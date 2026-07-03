import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { Lobby } from './components/Lobby';
import { MeetingRoom } from './components/MeetingRoom';
import { Login } from './components/Login';
import './App.css';

type ViewState = 'dashboard' | 'lobby' | 'room';

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const joinParam = urlParams.get('join');

  // Parse initial state from URL
  let initialView: ViewState = 'dashboard';
  let initialMeetId = '';
  
  if (joinParam) {
    initialMeetId = joinParam;
    initialView = 'lobby';
  }

  const [view, setView] = useState<ViewState>(initialView);
  const [selectedMeetId, setSelectedMeetId] = useState<string>(initialMeetId);
  const [displayName, setDisplayName] = useState<string>('');
  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [autoPilot, setAutoPilot] = useState<boolean>(false);
  const [role, setRole] = useState<'admin' | 'candidate'>('candidate');
  
  // Admin login check - bypass if joining direct link
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(!!joinParam);

  // Sync state if URL changes or we load page
  useEffect(() => {
    if (joinParam) {
      setSelectedMeetId(joinParam);
      setView('lobby');
      setIsAdminLoggedIn(true); // Bypass login for guest/candidate
    }
  }, [joinParam]);

  const handleJoinMeeting = (meetId: string) => {
    setSelectedMeetId(meetId);
    setRole('admin'); // Default role when host clicks from dashboard
    setView('lobby');
    window.history.pushState({}, '', `/?join=${meetId}`);
  };

  const handleLobbyJoin = (name: string, video: boolean, audio: boolean, auto: boolean, selectedRole: 'admin' | 'candidate') => {
    setDisplayName(name);
    setVideoEnabled(video);
    setAudioEnabled(audio);
    setAutoPilot(auto);
    setRole(selectedRole);
    setView('room');
  };

  const handleLeaveRoom = () => {
    setView(joinParam ? 'lobby' : 'dashboard');
    if (!joinParam) {
      setSelectedMeetId('');
      window.history.pushState({}, '', '/');
    }
  };

  const handleLogout = () => {
    setIsAdminLoggedIn(false);
    setSelectedMeetId('');
    window.history.pushState({}, '', '/');
  };

  // If not logged in and not joining via share link, show Login page
  if (!isAdminLoggedIn && !joinParam) {
    return <Login onLoginSuccess={() => setIsAdminLoggedIn(true)} />;
  }

  return (
    <>
      {view === 'dashboard' && (
        <Dashboard onJoinMeeting={handleJoinMeeting} onLogout={handleLogout} />
      )}
      
      {view === 'lobby' && (
        <Lobby 
          meetId={selectedMeetId} 
          onJoin={handleLobbyJoin} 
          onBack={() => {
            if (joinParam) {
              // Direct candidates cannot go back to admin dashboard
              alert("You cannot access the admin panel. Please use the interview link to join.");
            } else {
              setView('dashboard');
              window.history.pushState({}, '', '/');
            }
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
          role={role}
          onLeave={handleLeaveRoom} 
        />
      )}
    </>
  );
}

export default App;
