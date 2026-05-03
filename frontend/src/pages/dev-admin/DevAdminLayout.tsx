import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Badge,
  Box,
  Chip,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import MailIcon from '@mui/icons-material/Mail';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/api';

const DRAWER_WIDTH = 240;

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dev-admin', icon: <BarChartIcon />, exact: true },
  { label: 'Hospitals', path: '/dev-admin/hospitals', icon: <LocalHospitalIcon />, exact: false },
  { label: 'Contacts', path: '/dev-admin/contacts', icon: <MailIcon />, exact: false },
];

const DevAdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    apiClient.getDevAdminContacts(0, 1, true).then((res) => {
      setUnreadCount(res.data.unread_count);
    }).catch(() => {});
  }, [location.pathname]);

  const isActive = (path: string, exact: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: 'grey.900',
            color: 'grey.100',
            borderRight: 'none',
          },
        }}
      >
        <Toolbar sx={{ px: 2, py: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ color: 'primary.light', fontWeight: 700, fontSize: '1.1rem' }}>
              CereSignal
            </Typography>
            <Typography variant="caption" sx={{ color: 'grey.400', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Dev Admin Portal
            </Typography>
          </Box>
        </Toolbar>
        <Divider sx={{ borderColor: 'grey.700' }} />
        <List sx={{ pt: 1, flex: 1 }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path, item.exact);
            const icon =
              item.label === 'Contacts' && unreadCount > 0 ? (
                <Badge badgeContent={unreadCount} color="error" max={99}>
                  {item.icon}
                </Badge>
              ) : (
                item.icon
              );
            return (
              <ListItemButton
                key={item.path}
                onClick={() => navigate(item.path)}
                sx={{
                  mx: 1,
                  borderRadius: 2,
                  mb: 0.5,
                  color: active ? 'primary.light' : 'grey.400',
                  bgcolor: active ? 'rgba(37, 99, 235, 0.15)' : 'transparent',
                  '&:hover': {
                    bgcolor: active ? 'rgba(37, 99, 235, 0.2)' : 'rgba(255,255,255,0.05)',
                    color: 'grey.100',
                  },
                }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{icon}</ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: active ? 600 : 400 }}
                />
              </ListItemButton>
            );
          })}
        </List>
        <Divider sx={{ borderColor: 'grey.700' }} />
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', mb: 0.5 }}>
            Signed in as
          </Typography>
          <Typography variant="body2" sx={{ color: 'grey.300', fontWeight: 600, mb: 1 }}>
            {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username}
          </Typography>
          <Tooltip title="Sign out">
            <ListItemButton
              onClick={logout}
              sx={{
                borderRadius: 2,
                color: 'grey.400',
                px: 1,
                '&:hover': { color: 'error.light', bgcolor: 'rgba(239,68,68,0.1)' },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Sign out" primaryTypographyProps={{ fontSize: '0.85rem' }} />
            </ListItemButton>
          </Tooltip>
        </Box>
      </Drawer>

      {/* Main content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar
          position="static"
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'grey.200',
            color: 'text.primary',
          }}
        >
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {NAV_ITEMS.find((n) => isActive(n.path, n.exact))?.label ?? 'Dev Admin'}
            </Typography>
            <Chip
              label="Superuser"
              size="small"
              sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}
            />
          </Toolbar>
        </AppBar>

        <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default DevAdminLayout;
