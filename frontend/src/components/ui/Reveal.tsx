import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  margin?: string;
}

const EASE: [number, number, number, number] = [0.21, 0.47, 0.32, 0.98];

const Reveal = ({
  children,
  className,
  delay = 0,
  y = 24,
  margin = "-80px",
}: RevealProps) => {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
};

export default Reveal;