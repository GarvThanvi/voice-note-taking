import React from "react";

const Container = ({ children }: { children: React.ReactNode }) => {
  return <div className="mx-auto w-full max-w-7xl px-6">{children}</div>;
};

export default Container;
