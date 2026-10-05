import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './layouts/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Competitors from './pages/Competitors.jsx'
import Products from './pages/Products.jsx'
import Pricing from './pages/Pricing.jsx'
import Trends from './pages/Trends.jsx'
import Reports from './pages/Reports.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="competitors" element={<Competitors />} />
          <Route path="products" element={<Products />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="trends" element={<Trends />} />
          <Route path="reports" element={<Reports />} />
          {/* 未匹配路由一律回到数据看板 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
