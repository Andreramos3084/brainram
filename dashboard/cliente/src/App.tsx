import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Conversations from './pages/Conversations'
import Settings from './pages/Settings'
import Home from './pages/Home'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard/:slug" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="conversas" element={<Conversations />} />
        <Route path="configuracoes" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default App
