import {
  useContext,
  createContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  useEffect,
} from "react";
import { getCurrentUser } from "../api/authApi";

interface User {
  id: number;
  username: string;
  email: string;
  profilePicture?: string;
  hasSeenGuide?: boolean;
  showGuideOnLogin?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  guideRequested: boolean;
  setUser: (user: User | null) => void;
  login: (token: string, user: User) => void;
  logout: () => void;
  clearGuideRequest: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [guideRequested, setGuideRequested] = useState(false);

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await getCurrentUser(token);

        if (response.success) {
          setUser(response.user);
        } else {
          localStorage.removeItem("token");
          setUser(null);
        }
      } catch {
        localStorage.removeItem("token");
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  const login = useCallback((token: string, nextUser: User) => {
    localStorage.setItem("token", token);
    setUser(nextUser);
    setGuideRequested(!nextUser.hasSeenGuide || Boolean(nextUser.showGuideOnLogin));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
    setGuideRequested(false);
  }, []);

  const clearGuideRequest = useCallback(() => setGuideRequested(false), []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      guideRequested,
      setUser,
      login,
      logout,
      clearGuideRequest,
    }),
    [user, isLoading, guideRequested, login, logout, clearGuideRequest]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
};
