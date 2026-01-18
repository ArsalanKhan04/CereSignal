import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';

interface TopographicMapProps {
  fileId: number;
}

const TopographicMap: React.FC<TopographicMapProps> = ({ fileId }) => {
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Topographic Map
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <img
            src={`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api/v1'}/signals/files/${fileId}/topomap`}
            alt="Topographic Map"
            style={{ maxWidth: '100%', height: 'auto' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </Box>
      </CardContent>
    </Card>
  );
};

export default TopographicMap;
