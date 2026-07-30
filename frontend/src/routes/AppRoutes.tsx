import AppLayout from "../layouts/AppLayout";
import LandingPage from "../pages/LandingPage";
import { Routes, Route } from "react-router-dom";
import NotFound from "../pages/NotFound";

const AppRoutes = () => {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default AppRoutes