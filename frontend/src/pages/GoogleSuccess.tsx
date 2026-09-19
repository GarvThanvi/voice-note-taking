import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getCurrentUser } from "../api/authApi";
import { useAuth } from "../context/AuthContext";

const GoogleSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      navigate("/signin");
      return;
    }

    const complete = async () => {
      try {
        const response = await getCurrentUser(token);
        if (response.success) {
          login(token, response.user);
          navigate("/note", { replace: true });
        } else {
          navigate("/signin");
        }
      } catch {
        navigate("/signin");
      }
    };

    complete();
  }, [searchParams, navigate, login]);

  return (
    <>
      <Loader2
        size={48}
        className="animate-spin absolute top-1/2 left-1/2 text-primary"
      />
    </>
  );
};

export default GoogleSuccess;
