import { useState, useEffect } from "react";
import { Plus, FileText, Bookmark, Archive, Trash2, LogOut, MoreHorizontal } from "lucide-react";
import { AudioWaveform } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../ui/ConfirmModal";
import { labelFilterValue } from "../../lib/labelStyle";
import type { Label } from "../../api/labelApi";

interface SidebarProps {
  onNewNote: () => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  labels: Label[];
  onNewLabel: () => void;
  onEditLabel: (label: Label) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar = ({
  onNewNote,
  activeFilter,
  onFilterChange,
  labels,
  onNewLabel,
  onEditLabel,
  isOpen = false,
  onClose,
}: SidebarProps) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleFilterChange = (filter: string) => {
    onFilterChange(filter);
    onClose?.();
  };

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const initials = user
    ? user.username
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "JD";

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-[110] w-[260px] bg-background border-r border-border-subtle flex flex-col
          transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:sticky lg:top-0 lg:self-start lg:translate-x-0 lg:z-auto lg:h-screen lg:overflow-y-auto lg:transition-none
        `}
      >
        <div className="px-6 pt-7 pb-6">
          <div className="flex items-center gap-2.5">
            <AudioWaveform size={21} strokeWidth={2} className="text-primary" />
            <span className="text-[20px] font-bold tracking-[-0.5px]">
              NoteFlow
            </span>
          </div>
        </div>

        <div className="px-5">
          <button
            onClick={() => {
              onNewNote();
              onClose?.();
            }}
            className="
              w-full
              h-11
              rounded-button
              bg-primary
              hover:bg-primary-hover
              text-white
              font-semibold
              flex
              items-center
              justify-center
              gap-2
              transition-all
              duration-200
              shadow-[0_0_25px_rgba(255,64,88,0.18)]
              hover:shadow-[0_0_30px_rgba(255,64,88,0.28)]
            "
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>New Note</span>
          </button>
        </div>

        <nav className="px-4 mt-6 space-y-1 flex-1 overflow-y-auto pb-4">
          <SidebarItem
            icon={<FileText size={18} />}
            label="All Notes"
            active={activeFilter === "all"}
            onClick={() => handleFilterChange("all")}
          />
          <SidebarItem
            icon={<Bookmark size={18} />}
            label="Bookmark"
            active={activeFilter === "bookmark"}
            onClick={() => handleFilterChange("bookmark")}
          />
          <SidebarItem
            icon={<Archive size={18} />}
            label="Archive"
            active={activeFilter === "archive"}
            onClick={() => handleFilterChange("archive")}
          />
          <SidebarItem
            icon={<Trash2 size={18} />}
            label="Trash"
            active={activeFilter === "trash"}
            onClick={() => handleFilterChange("trash")}
          />

          <div className="pt-4">
            <div className="flex items-center justify-between px-3 pb-1">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Labels
              </span>
              <button
                onClick={onNewLabel}
                aria-label="New label"
                title="New label"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>

            {labels.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No labels yet
              </p>
            ) : (
              <div className="space-y-1">
                {labels.map((label) => {
                  const filter = labelFilterValue(label.id);
                  const active = activeFilter === filter;

                  return (
                    <div key={label.id} className="group/label flex items-center gap-1">
                      <button
                        onClick={() => handleFilterChange(filter)}
                        className={`
                          flex-1 min-w-0 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
                          ${
                            active
                              ? "bg-primary/[0.10] text-primary"
                              : "text-muted hover:text-foreground hover:bg-surface"
                          }
                        `}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="truncate flex-1 text-left">{label.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {label.noteCount}
                        </span>
                      </button>
                      <button
                        onClick={() => onEditLabel(label)}
                        aria-label={`Edit ${label.name}`}
                        title={`Edit ${label.name}`}
                        className="shrink-0 p-1 rounded-md text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover/label:opacity-100 focus:opacity-100 hover:text-foreground transition-all"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        <div className="mt-auto px-5 pb-5">
          <div className="border-t border-border-subtle pt-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-sm font-semibold text-primary-soft">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.username || "Guest"}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {user?.email || ""}
                </p>
              </div>
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Log out"
        message="Are you sure you want to log out?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  );
};

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

const SidebarItem = ({ icon, label, active = false, onClick }: SidebarItemProps) => {
  return (
    <button
      onClick={onClick}
      className={`
        w-full
        flex
        items-center
        gap-3
        px-3
        py-2.5
        rounded-lg
        text-sm
        font-medium
        transition-all
        duration-150
        ${
          active
            ? "bg-primary/[0.10] text-primary"
            : "text-muted hover:text-foreground hover:bg-surface"
        }
      `}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

export default Sidebar;
