import { NavLink, Route, Routes } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import DayView from './components/DayView'
import Review from './components/Review'
import Progress from './components/Progress'

export default function App() {
  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="logo">🚀</span>
          <h1>30 天英语 · 指数级提升</h1>
        </div>
        <NavLink to="/review" className="pill">🔁 词卡复习</NavLink>
      </div>

      <div className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/day/:day" element={<DayView />} />
          <Route path="/review" element={<Review />} />
          <Route path="/progress" element={<Progress />} />
        </Routes>
      </div>

      <nav className="tabbar">
        <NavLink to="/" end>
          <span className="t-ic">🏠</span>首页
        </NavLink>
        <NavLink to="/review">
          <span className="t-ic">🔁</span>复习
        </NavLink>
        <NavLink to="/progress">
          <span className="t-ic">📈</span>进度
        </NavLink>
      </nav>
    </>
  )
}
