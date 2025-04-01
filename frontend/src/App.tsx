import { Route, BrowserRouter, Routes } from 'react-router-dom'
import { VideoCall } from './components/VideoCall'
import { Home } from './components/Home'

function App() {
  return (
    <>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/call/:roomId" element={<VideoCall />} />
      </Routes>
    </BrowserRouter>
    </>
  )
}

export default App