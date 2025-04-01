# 🚀 WebRTC Signaling Server: Desi Style! 🚀

## 👑 Kya Hai Ye Mast Cheez?

Arre bhai, ye hai humara **WebRTC Signaling Server** - ek dam _jhakaas_ backend jo aapke video calls ko smooth like butter banata hai! Socho isko apne dost ki tarah, jo aapke messages ko ek computer se dusre tak pahuchata hai, bina kisi nautanki ke!

## ✨ Is Server Ki Takatein ✨

- **WebSocket Connections** 🔌 - Real-time mein baat karo, ekdum rapchik style mein
- **Rooms Ka Prabandhan** 🏠 - Create karo, join karo, chod do, bilkul ghar jaisa feel
- **Chat Messaging** 💬 - Baatein karo dil khol ke, messages history bhi sambhal ke rakhta hai
- **Security Ke Funde** 🔒 - Rate limiting hai boss, koi spam nahi kar payega
- **Heartbeat System** ❤️ - Server ka dil dhadakta rehta hai, connections zinda hai ya nahi check karta rehta hai

## 🛠️ Setup Kaise Karein? Ekdum 1-2-3! 🛠️

```bash
# Repository ko apne ghar (local machine) pe bulao
git clone https://github.com/learnershakil/webrtc.git

# Server ke ghar mein ghuso
cd webrtc/backend

# Server ka saman mangwao
npm install

# Server ko kehdo kaam pe lag jao
tsc -b
node dist/index.js
```

## 🔥 Environment Variables: Server Ko Batao Kya Karna Hai 🔥

| Variable | Kya Hai Ye Bakchodi? | Default |
|----------|----------------------|---------|
| PORT | Server kis darwaze pe khada rahe | 8080 |
| LOG_LEVEL | Kitna bak-bak kare server | "info" |
| CORS_ORIGIN | Kaun kaun website se baat kare | "*" |

## 🤣 Warning: Zyada Mat Hero Bano! 🤣

> **Bhai/Behen:** Iss server ko production mein dalne se pehle security check zaroor karo, warna hackers aapki band baja denge! Server zyada load pe ghabraata hai, to pyaar se chalao.

## 🚨 Rate Limits 🚨

Hamara server koi free ka maal nahi hai! Har user ko bas `10 message per second` bhejne ki ijazat hai. Zyada spam kiya to timeout pe bhej denge, ekdum Big Boss style mein! 😎

## 📊 Stats Dekhna Hai? 📊

Server ka haal-chaal jaanne ke liye:
```
GET /api/stats
```

Fatafat pata chal jayega kitne log party kar rahe hain!

## 🧠 Developer Guide: Code Samajhne Ke Funde 🧠

Hamare code mein teen cheezein important hain:
1. **WebSocket Handling** - Connection banaane aur messages bhejne ka jugaad
2. **Room Management** - Kaun kis kamre mein hai iska hisaab-kitaab
3. **Signaling Logic** - WebRTC ke liye zaruri signals ka intezaam

## 🎭 Credits: Kis Genius Ne Banaya? 🎭

Ye masterpiece hamari team ne banaya hai - jinhone chai peete peete code kiya aur dimag lagaya, taaki aap video calls enjoy kar sakein!

## 🙏 Last Mein Ek Gyaan 🙏

> Code likhna asan hai, lekin ache code ka maintenance mushkil - isliye comments achhe se likhe hain, samajh lo to chappal vaar se bach jaoge!

## 📱 Ab Jao, Video Call Karo! 📱

![Maze Karo](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNzPOXIbvp4Cg/giphy.gif)