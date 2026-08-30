import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

const GoogleSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      navigate("/signin");
      return;
    }
    localStorage.setItem("token", token);
    navigate("/note", { replace: true });
  }, [searchParams, navigate]);

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
