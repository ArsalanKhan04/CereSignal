import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { apiClient } from '../services/api';
import { DashboardStats } from '../types';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await apiClient.getStats();
      if (response.status === 200) {
        setStats(response.data);
      } else {
        setError('Failed to load dashboard data');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error loading dashboard data';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!stats) {
    return <Alert severity="info">No data available</Alert>;
  }

  const conditionData = [
    { name: 'Normal', value: stats.condition_counts.normal, color: '#4caf50' },
    { name: 'Abnormal', value: stats.condition_counts.abnormal, color: '#f44336' },
    { name: 'Checking', value: stats.condition_counts.checking, color: '#ff9800' },
    { name: 'Failed', value: stats.condition_counts.failed, color: '#9e9e9e' },
  ].filter(item => item.value > 0);

  const normalRate = stats.condition_counts.normal + stats.condition_counts.abnormal > 0
    ? (stats.condition_counts.normal / (stats.condition_counts.normal + stats.condition_counts.abnormal)) * 100
    : 0;

  return (
    <Box sx={{ p: 6, minHeight: '100vh', backgroundColor: '#fafafa' }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 6, fontWeight: 600 }}>
        Dashboard
      </Typography>

      {/* Key Metrics */}
      <Grid container spacing={4} sx={{ mb: 8 }}>
        <Grid sx={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={{ height: '120px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <CardContent sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="body1" color="textSecondary" sx={{ mb: 2, fontWeight: 500 }}>
                Total EEG Files
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 600, color: 'primary.main' }}>
                {stats.total_files}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid sx={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={{ height: '120px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <CardContent sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="body1" color="textSecondary" sx={{ mb: 2, fontWeight: 500 }}>
                Total Patients
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 600, color: 'success.main' }}>
                {stats.total_patients}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid sx={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={{ height: '120px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <CardContent sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="body1" color="textSecondary" sx={{ mb: 2, fontWeight: 500 }}>
                Normal Rate
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 600, color: 'success.main' }}>
                {normalRate.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid sx={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={{ height: '120px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <CardContent sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="body1" color="textSecondary" sx={{ mb: 2, fontWeight: 500 }}>
                Average Duration
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 600, color: 'info.main' }}>
                {stats.file_stats.average_duration.toFixed(1)}s
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={4}>
        {/* Condition Pie Chart */}
        <Grid sx={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: '100%', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" gutterBottom sx={{ mb: 4, fontWeight: 600 }}>
                EEG File Conditions
              </Typography>
              {conditionData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={conditionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {conditionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height={300}>
                  <Typography variant="body1" color="textSecondary">
                    No data available
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Files */}
        <Grid sx={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: '100%', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" gutterBottom sx={{ mb: 4, fontWeight: 600 }}>
                Recent EEG Files
              </Typography>
              {stats.recent_files.length > 0 ? (
                <Box>
                  {stats.recent_files.map((file) => (
                    <Box
                      key={file.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 3,
                        mb: 2,
                        bgcolor: 'grey.50',
                        borderRadius: 2,
                        border: '1px solid #e0e0e0'
                      }}
                    >
                      <Box>
                        <Typography variant="body1" fontWeight="500" sx={{ mb: 1 }}>
                          {file.filename}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {file.patient_name}
                        </Typography>
                      </Box>
                      <Chip
                        label={file.condition}
                        size="small"
                        color={
                          file.condition === 'normal' ? 'success' :
                          file.condition === 'abnormal' ? 'error' :
                          file.condition === 'processing' ? 'warning' : 'default'
                        }
                      />
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height={200}>
                  <Typography variant="body1" color="textSecondary">
                    No recent files
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

      </Grid>
    </Box>
  );
};

export default Dashboard;
