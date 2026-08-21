import AppLayout from "../layouts/AppLayout";
import LandingPage from "../pages/LandingPage";
import { Routes, Route } from "react-router-dom";
import NotFound from "../pages/NotFound";
import LoginSignup from "../pages/LoginSignup";
import Note from "../pages/Note";

const AppRoutes = () => {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<LoginSignup/>}></Route>
      </Route>
      <Route path="/note" element={<Note/>}></Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default AppRoutes