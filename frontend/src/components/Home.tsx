import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const Home = () => {
  const [roomId, setRoomId] = useState("");
  const [displayName, setDisplayName] = useState(localStorage.getItem('displayName') || '');
  const [recentRooms, setRecentRooms] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Bhai recent rooms ka data localStorage se uthao
    const rooms = localStorage.getItem('recentRooms');
    if (rooms) {
      setRecentRooms(JSON.parse(rooms));
    }
  }, []);

  const saveDisplayName = () => {
    if (displayName.trim()) {
      localStorage.setItem('displayName', displayName);
    }
  };

  const createRoom = () => {
    saveDisplayName();
    
    // Room ID nahi diya? Toh chalo lucky draw khelte hain!
    const room = roomId || Math.random().toString(36).substring(2, 9);
    
    // Recent rooms mein entry karte hain, yaad rahega!
    saveRecentRoom(room);
    
    navigate(`/call/${room}`);
  };

  const joinRoom = () => {
    if (!roomId) {
      alert("Please enter a room ID to join");
      return;
    }
    
    saveDisplayName();
    saveRecentRoom(roomId);
    navigate(`/call/${roomId}`);
  };

  const saveRecentRoom = (room: string) => {
    let rooms = [...recentRooms];
    
    // Naya room shuru mein daalo agar pehle se nahi hai
    if (!rooms.includes(room)) {
      rooms.unshift(room);
      // Sirf pichle 5 rooms ka hi record rakho
      rooms = rooms.slice(0, 5);
      setRecentRooms(rooms);
      localStorage.setItem('recentRooms', JSON.stringify(rooms));
    }
  };

  const joinRecentRoom = (room: string) => {
    setRoomId(room);
    saveDisplayName();
    navigate(`/call/${room}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E6C7E6] to-[#663399] flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-md p-8 border border-[#A3779D]/30">
        <h1 className="text-3xl font-bold text-[#2E1A47] text-center mb-2">Learner&apos;s Connect</h1>
        <p className="text-[#663399] text-center mb-8">Connect with friends and colleagues through high-quality video calls</p>
        
        <div className="mb-5">
          <label htmlFor="display-name" className="block text-sm font-medium text-[#2E1A47] mb-1">Your Name</label>
          <input
            id="display-name"
            type="text"
            placeholder="Enter your display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full p-3 border border-[#A3779D]/30 rounded-lg focus:ring-2 focus:ring-[#663399] focus:border-transparent transition-all outline-none"
          />
        </div>
        
        <div className="mb-6">
          <label htmlFor="room-id" className="block text-sm font-medium text-[#2E1A47] mb-1">Room ID</label>
          <input
            id="room-id"
            type="text"
            placeholder="Enter room ID or create a new one"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="w-full p-3 border border-[#A3779D]/30 rounded-lg focus:ring-2 focus:ring-[#663399] focus:border-transparent transition-all outline-none"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button 
            onClick={createRoom} 
            className="bg-[#663399] hover:bg-[#2E1A47] text-white font-medium py-3 px-4 rounded-lg transition-all shadow-md hover:shadow-lg"
          >
            Create New Call
          </button>
          <button 
            onClick={joinRoom} 
            disabled={!roomId}
            className={`bg-[#A3779D] hover:bg-[#663399] text-white font-medium py-3 px-4 rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Join Existing Call
          </button>
        </div>
        
        {recentRooms.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-[#2E1A47] mb-2">Recent Rooms</h3>
            <div className="bg-[#E6C7E6]/30 rounded-lg p-2">
              {recentRooms.map((room, index) => (
                <button 
                  key={index}
                  onClick={() => joinRecentRoom(room)}
                  className="w-full text-left py-2 px-3 mb-1 last:mb-0 rounded-md hover:bg-[#A3779D]/20 text-[#2E1A47] transition-colors"
                >
                  {room}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="bg-[#E6C7E6]/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-[#2E1A47] mb-2">Features</h3>
          <ul className="space-y-1">
            <li className="flex items-center text-[#2E1A47]">
              <span className="mr-2 text-[#663399]">✓</span>
              High-quality video calls
            </li>
            <li className="flex items-center text-[#2E1A47]">
              <span className="mr-2 text-[#663399]">✓</span>
              Screen sharing
            </li>
            <li className="flex items-center text-[#2E1A47]">
              <span className="mr-2 text-[#663399]">✓</span>
              In-call text chat
            </li>
            <li className="flex items-center text-[#2E1A47]">
              <span className="mr-2 text-[#663399]">✓</span>
              Multiple participants
            </li>
            <li className="flex items-center text-[#2E1A47]">
              <span className="mr-2 text-[#663399]">✓</span>
              Device selection
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};