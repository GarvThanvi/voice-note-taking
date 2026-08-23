import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader2 } from "lucide-react";

const GuestRoutes = () => {
  const { user, isLoading } = useAuth();

   if (isLoading) {
    return <Loader2 size={48} className="animate-spin absolute top-1/2 left-1/2 text-primary" />;
  }

  if (user) {
    return <Navigate to="/note" replace></Navigate>;
  }

  return <Outlet />;
};

export default GuestRoutes;
