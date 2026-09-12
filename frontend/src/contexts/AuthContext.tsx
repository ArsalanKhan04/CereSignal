import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, LoginRequest, RegisterRequest } from '../types';
import { apiClient } from '../services/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  loginWithToken: (accessToken: string) => void;
  register: (userData: RegisterRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = apiClient.getAuthToken();
      if (token) {
        try {
          const response = await apiClient.getCurrentUser();
          if (response.status === 200) {
            setUser(response.data);
          } else {
            apiClient.clearAuth();
          }
        } catch (error) {
          console.error('Failed to get current user:', error);
          apiClient.clearAuth();
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await apiClient.login(credentials);
      if (response.status === 200) {
        apiClient.setAuthToken(response.data.access_token);
        
        // Get user info
        const userResponse = await apiClient.getCurrentUser();
        if (userResponse.status === 200) {
          setUser(userResponse.data);
          localStorage.setItem('current_user', JSON.stringify(userResponse.data));
        }
      } else {
        throw new Error('Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (userData: RegisterRequest) => {
    try {
      const response = await apiClient.register(userData);
      if (response.status === 201) {
        // Registration successful, now login
        await login({
          username: userData.username,
          password: userData.password
        });
      } else {
        throw new Error('Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const loginWithToken = (accessToken: string) => {
    apiClient.setAuthToken(accessToken);
    apiClient.getCurrentUser().then((r) => {
      if (r.status === 200) {
        setUser(r.data);
        localStorage.setItem('current_user', JSON.stringify(r.data));
      }
    });
  };

  const logout = () => {
    apiClient.clearAuth();
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    loginWithToken,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
