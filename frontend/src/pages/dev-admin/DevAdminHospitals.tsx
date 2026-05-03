import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Fade,
  Grid,
  InputAdornment,
  Paper,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import PeopleIcon from '@mui/icons-material/People';
import FolderIcon from '@mui/icons-material/Folder';
import PersonIcon from '@mui/icons-material/Person';
import { apiClient } from '../../services/api';
import { DevAdminHospitalSummary } from '../../types';

const HospitalCard: React.FC<{ hospital: DevAdminHospitalSummary }> = ({ hospital }) => {
  const navigate = useNavigate();

  return (
    <Paper
      sx={{
        p: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.2s, transform 0.15s',
        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: 'primary.50',
              color: 'primary.main',
              display: 'flex',
            }}
          >
            <LocalHospitalIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              {hospital.name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {hospital.code}
            </Typography>
          </Box>
        </Box>
        <Chip
          label={hospital.is_active ? 'Active' : 'Inactive'}
          size="small"
          color={hospital.is_active ? 'success' : 'default'}
          variant="outlined"
        />
      </Box>

      {hospital.address && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.8rem' }}>
          {hospital.address}
        </Typography>
      )}

      <Grid container spacing={1.5} sx={{ mt: 'auto', pt: 1.5 }}>
        {[
          { label: 'Doctors', value: hospital.total_doctors, icon: <PersonIcon sx={{ fontSize: 14 }} /> },
          { label: 'Technicians', value: hospital.total_technicians, icon: <PeopleIcon sx={{ fontSize: 14 }} /> },
          { label: 'Patients', value: hospital.total_patients, icon: <PeopleIcon sx={{ fontSize: 14 }} /> },
          { label: 'EEG Files', value: hospital.total_files, icon: <FolderIcon sx={{ fontSize: 14 }} /> },
        ].map((stat) => (
          <Grid key={stat.label} size={{ xs: 6 }}>
            <Box
              sx={{
                p: 1,
                borderRadius: 1.5,
                bgcolor: 'grey.50',
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
              }}
            >
              <Box sx={{ color: 'primary.main' }}>{stat.icon}</Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1 }}>
                  {stat.label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {stat.value}
                </Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {(hospital.pending_reports > 0 || hospital.completed_reports > 0) && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          {hospital.pending_reports > 0 && (
            <Chip
              label={`${hospital.pending_reports} pending reports`}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ fontSize: '0.7rem' }}
            />
          )}
          {hospital.completed_reports > 0 && (
            <Chip
              label={`${hospital.completed_reports} finalized`}
              size="small"
              color="success"
              variant="outlined"
              sx={{ fontSize: '0.7rem' }}
            />
          )}
        </Box>
      )}

      <Button
        variant="outlined"
        size="small"
        onClick={() => navigate(`/dev-admin/hospitals/${hospital.id}`)}
        sx={{ mt: 2, alignSelf: 'flex-start' }}
      >
        View Details
      </Button>
    </Paper>
  );
};

const DevAdminHospitals: React.FC = () => {
  const [hospitals, setHospitals] = useState<DevAdminHospitalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiClient
      .getDevAdminHospitals()
      .then((res) => setHospitals(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = hospitals.filter(
    (h) =>
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Fade in timeout={400}>
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>
            Hospitals
          </Typography>
          <Chip label={`${hospitals.length} total`} variant="outlined" />
        </Box>

        <TextField
          placeholder="Search by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ mb: 3, width: 320 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
        />

        {loading ? (
          <Grid container spacing={2.5}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, xl: 4 }}>
                <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 2 }} />
              </Grid>
            ))}
          </Grid>
        ) : filtered.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              {search ? 'No hospitals match your search.' : 'No hospitals registered yet.'}
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2.5}>
            {filtered.map((h) => (
              <Grid key={h.id} size={{ xs: 12, sm: 6, xl: 4 }}>
                <HospitalCard hospital={h} />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Fade>
  );
};

export default DevAdminHospitals;
