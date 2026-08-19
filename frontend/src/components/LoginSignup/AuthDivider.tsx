const AuthDivider = () => {
  return (
    <div className="flex items-center gap-4">
      <div className="h-px flex-1 bg-border-subtle" />

      <span className="text-xs text-muted">
        or
      </span>

      <div className="h-px flex-1 bg-border-subtle" />
    </div>
  );
};

export default AuthDivider;