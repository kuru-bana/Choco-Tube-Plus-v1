import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Search from './pages/Search'
import Trend from './pages/Trend'
import Watch from './pages/Watch'
import Channel from './pages/Channel'
import Playlist from './pages/Playlist'
import Mix from './pages/Mix'
import Hashtag from './pages/Hashtag'
import Library from './pages/Library'
import Settings from './pages/Settings'
import Chat from './pages/Chat'
import LinkList from './pages/LinkList'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="chat" element={<Chat />} />
        <Route path="links" element={<Layout />}>
          <Route index element={<LinkList />} />
        </Route>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="search" element={<Search />} />
          <Route path="trend" element={<Trend />} />
          <Route path="watch/:videoId" element={<Watch />} />
          <Route path="watch" element={<Watch />} />
          <Route path="channel" element={<Channel />} />
          <Route path="channel/:channelId" element={<Channel />} />
          <Route path="playlist" element={<Playlist />} />
          <Route path="playlist/:id" element={<Playlist />} />
          <Route path="mix" element={<Mix />} />
          <Route path="mix/:id" element={<Mix />} />
          <Route path="hashtag/:tag" element={<Hashtag />} />
          <Route path="library" element={<Library />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
