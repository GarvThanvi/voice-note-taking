import type { ReactNode } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical } from "lucide-react";

export interface DraggableNoteProps {
  id: number;
  className?: string;
  variant?: "grid" | "list";
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  children: ReactNode;
}

const DraggableNote = ({
  id,
  className,
  variant = "grid",
  onDragStart,
  onDragEnd,
  children,
}: DraggableNoteProps) => {
  const controls = useDragControls();
  const isList = variant === "list";

  return (
    <Reorder.Item
      as="div"
      value={id}
      className={`relative group ${className ?? ""}`}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => onDragStart(id)}
      onDragEnd={onDragEnd}
      whileDrag={{
        scale: 1.03,
        zIndex: 30,
        boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
      }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        onClick={(e) => e.stopPropagation()}
        className={`
          absolute z-10 touch-none cursor-grab active:cursor-grabbing
          text-muted-foreground/60 hover:text-foreground transition-colors
          ${isList ? "left-2 top-1/2 -translate-y-1/2" : "right-3 top-3"}
        `}
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>

      {children}
    </Reorder.Item>
  );
};

export default DraggableNote;
