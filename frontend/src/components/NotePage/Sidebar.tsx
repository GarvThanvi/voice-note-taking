import { useState } from "react";
import { Plus, FileText, Bookmark, LogOut } from "lucide-react";
import { AudioWaveform } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../ui/ConfirmModal";

interface SidebarProps {
  onNewNote: () => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

const Sidebar = ({ onNewNote, activeFilter, onFilterChange }: SidebarProps) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const initials = user
    ? user.username
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "JD";

  return (
    <aside className="w-[260px] min-h-screen bg-background border-r border-border-subtle flex flex-col">
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
          onClick={onNewNote}
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

      <nav className="px-4 mt-6 space-y-1">
        <SidebarItem
          icon={<FileText size={18} />}
          label="All Notes"
          active={activeFilter === "all"}
          onClick={() => onFilterChange("all")}
        />
        <SidebarItem
          icon={<Bookmark size={18} />}
          label="Bookmark"
          active={activeFilter === "bookmark"}
          onClick={() => onFilterChange("bookmark")}
        />
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

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Log out"
        message="Are you sure you want to log out?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </aside>
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
