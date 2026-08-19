import Button from "../ui/Button";

const GoogleButton = () => {
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-12 w-full"
    >
      <span className="text-base font-semibold">
        G
      </span>

      <span>Continue with Google</span>
    </Button>
  );
};

export default GoogleButton;