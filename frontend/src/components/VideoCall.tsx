import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

export const VideoCall = () => {
  // yeh state aur ref waale declarations ko waise hi rehne do, unka scene tight hai
  const { roomId } = useParams<{ roomId: string }>();
  const userId = useRef(crypto.randomUUID());
  const navigate = useNavigate();

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const remoteVideosContainerRef = useRef<HTMLDivElement>(null);

  // yeh peer connections aur remote streams ka jugad hai, inko mat chedna
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const remoteStreams = useRef<Record<string, MediaStream>>({});

  // UI waale states ka scene waise hi mast hai, tension mat le
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState(
    localStorage.getItem("displayName") || "User"
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<
    { sender: string; text: string; time: string }[]
  >([]);
  const [newMessage, setNewMessage] = useState("");
  const [connectionQuality, setConnectionQuality] = useState<
    "good" | "fair" | "poor"
  >("good");
  const [showSettings, setShowSettings] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<{
    audio: MediaDeviceInfo[];
    video: MediaDeviceInfo[];
  }>({ audio: [], video: [] });
  const [selectedDevices, setSelectedDevices] = useState<{
    audio: string;
    video: string;
  }>({ audio: "", video: "" });
  const [error, setError] = useState<string | null>(null);

  // connection ka setup karte hain
  useEffect(() => {
    if (!roomId) {
      navigate("/");
      return;
    }

    // agar naam nahi set kiya to abhi karwa lete hain
    if (!localStorage.getItem("displayName")) {
      const name = prompt("Enter your display name:") || "User";
      localStorage.setItem("displayName", name);
      setDisplayName(name);
    }

    // signaling server se connection ka jugaad yahan hota hai
    connectToSignalingServer();

    // media devices ka jugaad yahan hota hai
    getAvailableDevices();

    // connection quality ka health check yahan hota hai
    const intervalId = setInterval(checkConnectionQuality, 10000);

    return () => {
      cleanupResources();
      clearInterval(intervalId);
    };
  }, [roomId, navigate]);

  const connectToSignalingServer = () => {
    setIsConnecting(true);
    socketRef.current = new WebSocket(`ws://${window.location.hostname}:8080`);

    socketRef.current.onopen = () => {
      // socket jud gaya, ab room join karte hain
      socketRef.current?.send(
        JSON.stringify({
          type: "join",
          roomId: roomId || "default",
          userId: userId.current,
          displayName: displayName,
        })
      );

      setIsConnected(true);
      setIsConnecting(false);
      setupLocalMedia();
    };

    socketRef.current.onmessage = handleSocketMessage;

    socketRef.current.onclose = () => {
      setIsConnected(false);
      // thoda ruk ja, abhi dubara koshish karte hain
      setTimeout(connectToSignalingServer, 3000);
    };

    socketRef.current.onerror = () => {
      setError("Connection to server failed. Trying to reconnect...");
    };
  };

  const getAvailableDevices = async () => {
    try {
      // devices ka permission maangte hain, warna kaise chalega scene
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

      const devices = await navigator.mediaDevices.enumerateDevices();

      const audioDevices = devices.filter(
        (device) => device.kind === "audioinput"
      );
      const videoDevices = devices.filter(
        (device) => device.kind === "videoinput"
      );

      setAvailableDevices({
        audio: audioDevices,
        video: videoDevices,
      });

      // default devices ka jugaad yahan hota hai
      if (audioDevices.length > 0 && !selectedDevices.audio) {
        setSelectedDevices((prev) => ({
          ...prev,
          audio: audioDevices[0].deviceId,
        }));
      }

      if (videoDevices.length > 0 && !selectedDevices.video) {
        setSelectedDevices((prev) => ({
          ...prev,
          video: videoDevices[0].deviceId,
        }));
      }
    } catch (err) {
      console.error("Error accessing media devices:", err);
      setError(
        "Could not access camera or microphone. Please check permissions."
      );
    }
  };

  const setupLocalMedia = async () => {
    try {
      const constraints = {
        video: selectedDevices.video
          ? { deviceId: { exact: selectedDevices.video } }
          : true,
        audio: selectedDevices.audio
          ? { deviceId: { exact: selectedDevices.audio } }
          : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Apne aap ko bhi participants list mein ghusa lo, warna kaise chalega
      setParticipants((prev) => [
        ...prev.filter((p) => p !== userId.current),
        userId.current,
      ]);
    } catch (err) {
      console.error("Error accessing media devices:", err);
      setError(
        "Could not access camera or microphone. Please check permissions."
      );
    }
  };

  // Signaling server se aayi chitthi ka jawab yahan likhte hain
  const handleSocketMessage = (event: MessageEvent) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case "user-joined":
        // participants list ko update karte hain
        setParticipants((prev) => [
          ...prev.filter((p) => p !== message.userId),
          message.userId,
        ]);

        // Bhai ne room join kiya, ab nayi connection banate hain
        const pc = createPeerConnection(message.userId, message.displayName);

        // Bhai ne room join kiya, ab call shuru karte hain (jo pehle se room mein tha)
        if (localStreamRef.current && pc) {
          createAndSendOffer(message.userId, pc);
        }
        break;

      case "user-left":
        // Bhai ne room chhod diya, list se hata dete hain
        setParticipants((prev) => prev.filter((p) => p !== message.userId));

        // Bhai ka connection bhi tod dete hain, warna resources waste honge
        if (peerConnections.current[message.userId]) {
          peerConnections.current[message.userId].close();
          delete peerConnections.current[message.userId];
        }

        // Bhai ka stream bhi hata dete hain, ab kaam ka nahi raha
        if (remoteStreams.current[message.userId]) {
          delete remoteStreams.current[message.userId];
        }

        // Bhai ka video hata diya, ab kaam ka nahi raha
        const videoElToRemove = document.getElementById(
          `remote-video-${message.userId}`
        );
        if (videoElToRemove && videoElToRemove.parentNode) {
          videoElToRemove.parentNode.removeChild(videoElToRemove);
        }
        break;

      case "offer":
        handleOffer(message);
        break;

      case "answer":
        handleAnswer(message);
        break;

      case "ice-candidate":
        handleIceCandidate(message);
        break;

      case "chat-message":
        setMessages((prev) => [
          ...prev,
          {
            sender: message.displayName || message.from,
            text: message.text,
            time: new Date().toLocaleTimeString(),
          },
        ]);
        break;
    }
  };

  // Bhai ke liye nayi RTCPeerConnection ka jugaad karte hain
  const createPeerConnection = (peerId: string, peerDisplayName?: string) => {
    console.log(`Creating peer connection to ${peerId}`);

    // Naya RTCPeerConnection banate hain STUN servers ke saath, taaki connection ka jugaad ho sake
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    // Apne tracks peer connection mein ghusa do, bina jhijhak ke
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
      if (localStreamRef.current) {
        pc.addTrack(track, localStreamRef.current);
      }
      });
    }

    // ICE candidates ka jugaad yahan hota hai
    pc.onicecandidate = (event) => {
      if (event.candidate) {
      // Peer ko ICE candidate bhejo, dosti nibhao
        socketRef.current?.send(
          JSON.stringify({
            type: "ice-candidate",
            target: peerId,
            data: event.candidate,
          })
        );
      }
    };

    // Bhai ke tracks aa gaye, ab unka jugaad karte hain
    pc.ontrack = (event) => {
      console.log(`Received tracks from ${peerId}`);

      // Create or get the remote stream for this peer
      if (!remoteStreams.current[peerId]) {
      remoteStreams.current[peerId] = new MediaStream();

      // Create a video element for this remote stream
        createVideoElement(
          peerId,
          peerDisplayName || "Peer",
          remoteStreams.current[peerId]
        );
      }

      // Bhai ke stream ke tracks ko remote stream mein ghusa dete hain
      event.streams[0].getTracks().forEach((track) => {
        if (remoteStreams.current[peerId]) {
          remoteStreams.current[peerId].addTrack(track);
        }
      });
        };

        // Bhai ka connection yaad rakhte hain, warna bhool jayenge
    peerConnections.current[peerId] = pc;

    return pc;
  };

  // Bhai ke liye ek video element banate hain aur usko lagate hain
  const createVideoElement = (
    peerId: string,
    displayName: string,
    stream: MediaStream
  ) => {
    // Bhai ka video pehle se laga hai kya? Agar haan to nikal lo yahan se
    if (document.getElementById(`remote-video-${peerId}`)) {
      return;
    }

    // Bhai ke liye ek container div banate hain, taaki uska video aur naam ekdum mast lage
    const videoContainer = document.createElement("div");
    videoContainer.id = `remote-container-${peerId}`;
    videoContainer.className =
      "relative bg-[#663399]/20 rounded-xl overflow-hidden";

    // Bhai ke liye ek video element banate hain
    const videoEl = document.createElement("video");
    videoEl.id = `remote-video-${peerId}`;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.className = "w-full h-full object-cover rounded-xl";
    videoEl.srcObject = stream;

    // name label bnate h
    const nameLabel = document.createElement("div");
    nameLabel.className =
      "absolute bottom-2 left-2 bg-black/50 px-3 py-1 rounded-full text-white text-sm";
    nameLabel.textContent = displayName;

    // elements ko Append krte h
    videoContainer.appendChild(videoEl);
    videoContainer.appendChild(nameLabel);

    // Bhai ka video remote videos container mein ghusa dete hain
    const remoteVideosContainer = document.getElementById("remote-videos");
    if (remoteVideosContainer) {
      remoteVideosContainer.appendChild(videoContainer);
    }
  };

  // Bhai ko offer bhejne ka jugaad yahan hota hai
  const createAndSendOffer = async (peerId: string, pc: RTCPeerConnection) => {
    try {
      // Offer banate hain, audio aur video dono maangte hain
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      // Apne taraf ka description set karte hain
      await pc.setLocalDescription(offer);

      // Bhai ko offer bhejte hain
      socketRef.current?.send(
        JSON.stringify({
          type: "offer",
          target: peerId,
          data: offer,
        })
      );

      console.log(`Sent offer to ${peerId}`);
    } catch (err) {
      console.error("Error creating offer:", err);
      setError("Failed to create connection offer");
    }
  };

  // Bhai ka offer aaya hai, ab uska jugaad karte hain
  const handleOffer = async (message: any) => {
    try {
      const { from, data: offer, displayName: peerDisplayName } = message;
      console.log(`Received offer from ${from}`);

      // Agar peer connection nahi hai to nayi banate hain
      if (!peerConnections.current[from]) {
        createPeerConnection(from, peerDisplayName);
      }

      const pc = peerConnections.current[from];

      // Bhai ka remote description set karte hain
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Bhai ke liye ek answer banate hain
      const answer = await pc.createAnswer();

      // Apne taraf ka local description set karte hain
      await pc.setLocalDescription(answer);

      // Bhai ko answer bhejte hain
      socketRef.current?.send(
        JSON.stringify({
          type: "answer",
          target: from,
          data: answer,
        })
      );

      console.log(`Sent answer to ${from}`);
    } catch (err) {
      console.error("Error handling offer:", err);
      setError("Failed to process incoming call offer");
    }
  };

  // Bhai ka jawab aaya hai, ab uska jugaad karte hain
  const handleAnswer = async (message: any) => {
    try {
      const { from, data: answer } = message;
      console.log(`Received answer from ${from}`);

      const pc = peerConnections.current[from];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`Set remote description for ${from}`);
      }
    } catch (err) {
      console.error("Error handling answer:", err);
      setError("Failed to establish connection");
    }
  };

  // Bhai ka ICE candidate aaya hai, ab uska jugaad karte hain
  const handleIceCandidate = async (message: any) => {
    try {
      const { from, data: candidate } = message;
      console.log(`Received ICE candidate from ${from}`);

      const pc = peerConnections.current[from];
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`Added ICE candidate for ${from}`);
      }
    } catch (err) {
      console.error("Error handling ICE candidate:", err);
      // Error aaya, par chhota mota hai, ignore kar do
        }
      };

      // Audio mute/unmute ka switch
      const toggleMute = () => {
        localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = isMuted;
        });
        setIsMuted(!isMuted);
      };

      // Video on/off ka switch
      const toggleVideo = () => {
        localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = isVideoOff;
        });
        setIsVideoOff(!isVideoOff);
      };

      // Screen share ka switch
      const toggleScreenShare = async () => {
        if (isScreenSharing) {
      // Screen sharing band karte hain
      screenShareStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      // Camera wapas lagate hain
      if (localStreamRef.current && localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;

        // Sab peers ko camera ka track bhejte hain
        Object.keys(peerConnections.current).forEach((peerId) => {
          const pc = peerConnections.current[peerId];

          // Screen share hata ke camera lagate hain
          const senders = pc.getSenders();
          const videoSender = senders.find(
        (sender) => sender.track?.kind === "video"
          );

          if (videoSender && localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoSender.replaceTrack(videoTrack);
        }
          }
        });
      }

      screenShareStreamRef.current = null;
        } else {
      // Screen share shuru karte hain
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });

        screenShareStreamRef.current = stream;

        // Local video mein screen dikhate hain
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Sab peers ko screen share ka track bhejte hain
        const videoTrack = stream.getVideoTracks()[0];
        Object.keys(peerConnections.current).forEach((peerId) => {
          const pc = peerConnections.current[peerId];

          // Camera hata ke screen share lagate hain
          const senders = pc.getSenders();
          const videoSender = senders.find(
        (sender) => sender.track?.kind === "video"
          );

          if (videoSender && videoTrack) {
        videoSender.replaceTrack(videoTrack);
          }
        });

        // Screen share band hone ka event handle karte hain
        videoTrack.onended = () => {
          toggleScreenShare();
        };
      } catch (err) {
        console.error("Screen share mein error:", err);
        setError("Screen share shuru karne mein dikkat");
        return;
      }
        }

        setIsScreenSharing(!isScreenSharing);
      };

      // Chat message bhejne ka jugaad
      const sendChatMessage = () => {
        if (!newMessage.trim()) return;

        // Apne chat mein message add karte hain
        const messageObj = {
      sender: "You",
      text: newMessage,
      time: new Date().toLocaleTimeString(),
        };

        setMessages((prev) => [...prev, messageObj]);

        // Sab peers ko message bhejte hain
        socketRef.current?.send(
      JSON.stringify({
        type: "chat-message",
        data: newMessage,
      })
        );

        setNewMessage("");
      };

      // Audio ya video device change karne ka jugaad
      const changeDevice = async (type: "audio" | "video", deviceId: string) => {
        try {
      setSelectedDevices((prev) => ({ ...prev, [type]: deviceId }));

      // Purane tracks ko band karte hain
      localStreamRef.current?.getTracks().forEach((track) => {
        if (
          (type === "audio" && track.kind === "audio") ||
          (type === "video" && track.kind === "video")
        ) {
          track.stop();
        }
      });

      // Naya stream lete hain selected device ke saath
      const constraints: MediaStreamConstraints = {
        audio:
          type === "audio"
        ? { deviceId: { exact: deviceId } }
        : localStreamRef.current?.getAudioTracks().length
        ? true
        : false,
        video:
          type === "video"
        ? { deviceId: { exact: deviceId } }
        : localStreamRef.current?.getVideoTracks().length
        ? true
        : false,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Local stream mein naye tracks lagate hain
      if (localStreamRef.current) {
        if (type === "audio") {
          const audioTrack = newStream.getAudioTracks()[0];
          const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];

          if (oldAudioTrack) {
        localStreamRef.current.removeTrack(oldAudioTrack);
        oldAudioTrack.stop();
          }

          if (audioTrack) {
        localStreamRef.current.addTrack(audioTrack);
        audioTrack.enabled = !isMuted;
          }
        } else {
          const videoTrack = newStream.getVideoTracks()[0];
          const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];

          if (oldVideoTrack) {
        localStreamRef.current.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
          }

          if (videoTrack) {
        localStreamRef.current.addTrack(videoTrack);
        videoTrack.enabled = !isVideoOff;
          }
        }
      } else {
        localStreamRef.current = newStream;
      }

      // Local video update karte hain
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      // Peer connections mein naye tracks bhejte hain
      Object.keys(peerConnections.current).forEach((peerId) => {
        const pc = peerConnections.current[peerId];
        const senders = pc.getSenders();

        if (type === "audio") {
          const audioSender = senders.find(
            (sender) => sender.track?.kind === "audio"
          );
          const audioTrack = localStreamRef.current?.getAudioTracks()[0];

          if (audioSender && audioTrack) {
            audioSender.replaceTrack(audioTrack);
          }
        } else {
          const videoSender = senders.find(
            (sender) => sender.track?.kind === "video"
          );
          const videoTrack = localStreamRef.current?.getVideoTracks()[0];

          if (videoSender && videoTrack) {
            videoSender.replaceTrack(videoTrack);
          }
        }
      });
    } catch (err) {
      console.error(`Error changing ${type} device:`, err);
      setError(`Failed to switch ${type} device`);
    }
  };

  // Connection quality ka health check (thoda simplified hai)
  const checkConnectionQuality = () => {
    // Asli app mein RTCPeerConnection ke stats check karte
    // Abhi ke liye random value ka jugaad
    const qualities = ["good", "fair", "poor"] as const;
    const randomQuality =
      qualities[Math.floor(Math.random() * qualities.length)];
    setConnectionQuality(randomQuality);
  };

  // Component band hone par resources ka safaya
  const cleanupResources = () => {
    // Sab media tracks ko band karte hain
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenShareStreamRef.current?.getTracks().forEach((track) => track.stop());

    // Sab peer connections ko tod dete hain
    Object.values(peerConnections.current).forEach((pc) => pc.close());

    // WebSocket connection bhi band karte hain
    socketRef.current?.close();
  };

  // Call khatam karke ghar wapas bhejte hain
  const endCall = () => {
    cleanupResources();
    navigate("/");
  };

  // Connection quality ka indicator dikhate hain
  const getConnectionQualityClasses = () => {
    switch (connectionQuality) {
      case "good":
        return "bg-green-500";
      case "fair":
        return "bg-yellow-500";
      case "poor":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  // Loading ya error state ka scene yahan handle hota hai
  if (isConnecting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#E6C7E6] to-[#663399] flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#A3779D] border-t-[#2E1A47] rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-semibold text-white">
          Connecting to room...
        </h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#E6C7E6] to-[#663399] flex flex-col items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-[#2E1A47] mb-4">Error</h2>
          <p className="text-[#663399] mb-6">{error}</p>
          <div className="flex space-x-4">
            <button
              onClick={() => setError(null)}
              className="bg-[#663399] hover:bg-[#2E1A47] text-white px-4 py-2 rounded-lg transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => navigate("/")}
              className="bg-[#A3779D] hover:bg-[#663399] text-white px-4 py-2 rounded-lg transition-colors"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#2E1A47] flex flex-col">
      {/* Header */}
      <div className="bg-[#663399] text-white p-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Room: {roomId}</h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full ${getConnectionQualityClasses()} mr-2`}
            ></div>
            <span className="text-sm">
              {connectionQuality === "good"
                ? "Good"
                : connectionQuality === "fair"
                ? "Fair"
                : "Poor"}{" "}
              Connection
            </span>
          </div>
          <div className="bg-[#2E1A47] px-3 py-1 rounded-full text-xs">
            {participants.length} participant
            {participants.length !== 1 ? "s" : ""}
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="bg-[#2E1A47] p-2 rounded-full hover:bg-[#A3779D] transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              ></path>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              ></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 bg-[#2E1A47] p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr overflow-y-auto">
        {/* Local Video */}
        <div
          className={`relative bg-[#663399]/20 rounded-xl overflow-hidden ${
            isVideoOff ? "grid place-items-center" : ""
          }`}
        >
          {isVideoOff ? (
            <div className="text-[#E6C7E6] text-6xl">
              <svg
                className="w-20 h-20"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                ></path>
              </svg>
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover rounded-xl"
            />
          )}
          <div className="absolute bottom-2 left-2 bg-black/50 px-3 py-1 rounded-full text-white text-sm flex items-center space-x-2">
            <span>You {isScreenSharing ? "(Screen)" : ""}</span>
            {isMuted && <span className="text-red-500">🔇</span>}
          </div>
        </div>

        {/* Remote videos container */}
        <div id="remote-videos" className="contents"></div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-[#2E1A47]">Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[#2E1A47] hover:text-[#663399]"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  ></path>
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-[#2E1A47] mb-1">
                Microphone
              </label>
              <select
                value={selectedDevices.audio}
                onChange={(e) => changeDevice("audio", e.target.value)}
                className="w-full p-2 border border-[#A3779D]/30 rounded-lg focus:ring-2 focus:ring-[#663399] outline-none"
              >
                {availableDevices.audio.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label ||
                      `Microphone ${device.deviceId.substring(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-[#2E1A47] mb-1">
                Camera
              </label>
              <select
                value={selectedDevices.video}
                onChange={(e) => changeDevice("video", e.target.value)}
                className="w-full p-2 border border-[#A3779D]/30 rounded-lg focus:ring-2 focus:ring-[#663399] outline-none"
              >
                {availableDevices.video.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label ||
                      `Camera ${device.deviceId.substring(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-[#2E1A47] mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  localStorage.setItem("displayName", e.target.value);
                }}
                className="w-full p-2 border border-[#A3779D]/30 rounded-lg focus:ring-2 focus:ring-[#663399] outline-none"
              />
            </div>

            <button
              className="w-full bg-[#663399] hover:bg-[#2E1A47] text-white py-2 rounded-lg transition-colors"
              onClick={() => setShowSettings(false)}
            >
              Apply & Close
            </button>
          </div>
        </div>
      )}

      {/* Chat Panel - Keep the existing chat panel code */}
      {chatOpen && (
        <div className="absolute right-0 top-16 bottom-16 w-full sm:w-80 bg-white shadow-lg z-10 flex flex-col">
          {/* Keep existing chat panel implementation */}
          <div className="bg-[#663399] text-white p-3 flex justify-between items-center">
            <h3 className="font-semibold">Chat</h3>
            <button onClick={() => setChatOpen(false)}>
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 bg-[#E6C7E6]/10">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`mb-2 ${
                  msg.sender === "You" ? "ml-auto" : "mr-auto"
                } max-w-[80%]`}
              >
                <div
                  className={`rounded-lg p-2 ${
                    msg.sender === "You"
                      ? "bg-[#663399] text-white rounded-br-none"
                      : "bg-[#A3779D]/20 text-[#2E1A47] rounded-bl-none"
                  }`}
                >
                  {msg.sender !== "You" && (
                    <div className="text-xs font-medium mb-1">{msg.sender}</div>
                  )}
                  <div>{msg.text}</div>
                  <div className="text-xs opacity-70 text-right">
                    {msg.time}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 p-2 flex">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendChatMessage()}
              placeholder="Type a message..."
              className="flex-1 p-2 border border-[#A3779D]/30 rounded-l-lg focus:ring-1 focus:ring-[#663399] outline-none"
            />
            <button
              onClick={sendChatMessage}
              className="bg-[#663399] text-white px-3 rounded-r-lg hover:bg-[#2E1A47] transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                ></path>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Call Controls - Keep existing call controls */}
      <div className="bg-[#2E1A47] border-t border-[#663399]/50 p-4 flex justify-center">
        <div className="flex space-x-3">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full ${
              isMuted ? "bg-red-500" : "bg-[#663399]"
            } text-white hover:opacity-90 transition-opacity`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              {isMuted ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                ></path>
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                ></path>
              )}
            </svg>
          </button>

          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full ${
              isVideoOff ? "bg-red-500" : "bg-[#663399]"
            } text-white hover:opacity-90 transition-opacity`}
            title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              {isVideoOff ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                ></path>
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                ></path>
              )}
            </svg>
          </button>

          <button
            onClick={toggleScreenShare}
            className={`p-3 rounded-full ${
              isScreenSharing ? "bg-green-500" : "bg-[#663399]"
            } text-white hover:opacity-90 transition-opacity`}
            title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              ></path>
            </svg>
          </button>

          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="p-3 rounded-full bg-[#663399] text-white hover:opacity-90 transition-opacity relative"
            title="Chat"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              ></path>
            </svg>
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {messages.length}
              </span>
            )}
          </button>

          <button
            onClick={endCall}
            className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
            title="End Call"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
              ></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
