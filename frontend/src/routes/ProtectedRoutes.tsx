import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoutes = () => {
  const { user } = useAuth();
  const location = useLocation();

  if(!user){
    return <Navigate to="/signin" state={{from: location}} replace></Navigate>
  }

  return <Outlet />;
};

export default ProtectedRoutes;
