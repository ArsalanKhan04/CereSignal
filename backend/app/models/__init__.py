# Import all models to ensure they are registered with SQLAlchemy
# Hospital must be imported first since other models hold FKs to it
from .hospital import Hospital, StaffInvitation
from .auth import AuthUser, UserSession, UserType
from .user import User
from .signal import SignalFile, Signal, EEGBookmark
from .report import EEGReport, EEGReportVersion
from .notification import Notification
from .contact import ContactSubmission
