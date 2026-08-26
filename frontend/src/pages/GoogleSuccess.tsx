import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

const GoogleSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    console.log("1");
    const token = searchParams.get("token");
    console.log("1");
    if (!token) {
      navigate("/signin");
      return;
    }
    console.log("3");
    localStorage.setItem("token", token);
    navigate("/note", { replace: true });
    console.log("4");
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
