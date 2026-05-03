import React, { useEffect, useState } from 'react';
import {
  Box,
  Fade,
  Grid,
  Paper,
  Skeleton,
  Typography,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import PeopleIcon from '@mui/icons-material/People';
import BiotechIcon from '@mui/icons-material/Biotech';
import FolderIcon from '@mui/icons-material/Folder';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import MailIcon from '@mui/icons-material/Mail';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { apiClient } from '../../services/api';
import { DevAdminGlobalStats } from '../../types';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color, subtitle }) => (
  <Paper
    sx={{
      p: 2.5,
      height: '100%',
      borderLeft: `4px solid ${color}`,
      transition: 'box-shadow 0.2s',
      '&:hover': { boxShadow: 4 },
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <Box>
        <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.25 }}>
          {value}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
          {label}
        </Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          p: 1.25,
          borderRadius: 2,
          bgcolor: `${color}20`,
          color,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {icon}
      </Box>
    </Box>
  </Paper>
);

const STAT_CARD_COLORS = [
  '#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0f766e', '#9333ea',
];

const DevAdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DevAdminGlobalStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .getDevAdminStats()
      .then((res) => setStats(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const statCards = stats
    ? [
        { label: 'Total Hospitals', value: stats.total_hospitals, icon: <AccountBalanceIcon />, color: STAT_CARD_COLORS[0], subtitle: `${stats.active_hospitals} active` },
        { label: 'Doctors', value: stats.total_doctors, icon: <LocalHospitalIcon />, color: STAT_CARD_COLORS[1] },
        { label: 'Technicians', value: stats.total_technicians, icon: <PeopleIcon />, color: STAT_CARD_COLORS[2] },
        { label: 'Patients', value: stats.total_patients, icon: <BiotechIcon />, color: STAT_CARD_COLORS[3] },
        { label: 'EEG Files', value: stats.total_eeg_files, icon: <FolderIcon />, color: STAT_CARD_COLORS[4] },
        { label: 'Finalized Reports', value: stats.completed_reports, icon: <AssignmentIcon />, color: STAT_CARD_COLORS[5], subtitle: `${stats.total_reports} total` },
        { label: 'Pending Reports', value: stats.pending_reports, icon: <PendingActionsIcon />, color: STAT_CARD_COLORS[6] },
        { label: 'Unread Contacts', value: stats.unread_contacts, icon: <MailIcon />, color: STAT_CARD_COLORS[7] },
      ]
    : [];

  const chartData = (stats?.hospitals_breakdown ?? []).map((h) => ({
    name: h.name.length > 14 ? `${h.name.slice(0, 12)}…` : h.name,
    files: h.total_files,
    patients: h.total_patients,
  }));

  return (
    <Fade in timeout={400}>
      <Box>
        <Typography variant="h2" sx={{ mb: 3, fontWeight: 700 }}>
          Platform Overview
        </Typography>

        {/* Stat cards */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 2 }} />
                </Grid>
              ))
            : statCards.map((card) => (
                <Grid key={card.label} size={{ xs: 12, sm: 6, md: 3 }}>
                  <StatCard {...card} />
                </Grid>
              ))}
        </Grid>

        {/* Bar chart */}
        {!loading && chartData.length > 0 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h4" sx={{ mb: 2, fontWeight: 600 }}>
              EEG Files by Hospital (top 6)
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 13 }}
                  formatter={(v: number, name: string) => [v, name === 'files' ? 'EEG Files' : 'Patients']}
                />
                <Bar dataKey="files" name="files" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill={STAT_CARD_COLORS[idx % STAT_CARD_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        )}

        {!loading && chartData.length === 0 && (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No hospitals registered yet. Data will appear here once hospitals sign up.
            </Typography>
          </Paper>
        )}
      </Box>
    </Fade>
  );
};

export default DevAdminDashboard;
