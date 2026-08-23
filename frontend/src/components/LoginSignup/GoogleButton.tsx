import { Loader2 } from "lucide-react";
import Button from "../ui/Button";

interface GoogleButtonProps {
  onClick: () => void;
  loading: boolean;
}

const GoogleButton = ({ onClick, loading }: GoogleButtonProps) => {
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-12 w-full"
      onClick={onClick}
    >
      {loading ? (
        <Loader2 className="animate-spin" />
      ) : (
        <>
          <span className="text-base font-semibold">G</span>

          <span>Continue with Google</span>
        </>
      )}
    </Button>
  );
};

export default GoogleButton;
