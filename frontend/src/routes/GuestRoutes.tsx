import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const GuestRoutes = () => {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/note" replace></Navigate>;
  }

  return <Outlet />;
};

export default GuestRoutes;
