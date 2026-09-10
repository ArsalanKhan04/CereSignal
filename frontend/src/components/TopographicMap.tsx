import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { apiClient } from '../services/api';

interface TopographicMapProps {
  fileId: number;
}

const TopographicMap: React.FC<TopographicMapProps> = ({ fileId }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // The endpoint requires an Authorization header, so the PNG is fetched as a
  // blob and rendered from an object URL rather than hitting it with <img src>.
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    setImageUrl(null);
    setUnavailable(false);

    apiClient
      .getTopomap(fileId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Topographic Map
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Topographic Map"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          )}
          {unavailable && (
            <Typography variant="body2" color="text.secondary">
              No topographic map available for this recording.
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default TopographicMap;
