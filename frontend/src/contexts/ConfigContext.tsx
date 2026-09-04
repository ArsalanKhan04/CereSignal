import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '../services/api';

interface ConfigContextType {
  aiInferenceEnabled: boolean;
  isLoading: boolean;
}

// Default to AI enabled so a failed or in-flight config fetch never hides
// existing functionality — the flag only ever turns features off.
const ConfigContext = createContext<ConfigContextType>({
  aiInferenceEnabled: true,
  isLoading: true,
});

export const useConfig = () => useContext(ConfigContext);

interface ConfigProviderProps {
  children: ReactNode;
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [aiInferenceEnabled, setAiInferenceEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const response = await apiClient.getConfig();
        if (!cancelled && typeof response.data?.ai_inference_enabled === 'boolean') {
          setAiInferenceEnabled(response.data.ai_inference_enabled);
        }
      } catch (err) {
        // Keep the permissive default; the backend may be an older build
        // that predates /config.
        console.warn('Failed to load runtime config, assuming AI enabled', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ConfigContext.Provider value={{ aiInferenceEnabled, isLoading }}>
      {children}
    </ConfigContext.Provider>
  );
};
