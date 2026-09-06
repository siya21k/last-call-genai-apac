export type TaskStatus = 'pending' | 'met' | 'missed' | 'released';
export type ConsequenceType = 'hard' | 'soft' | 'unspecified';
export type PartnerInviteStatus = 'pending' | 'active' | 'revoked';

export interface AnchorTimes {
  beforeWork?: string;
  afterWork?: string;
  beforeSleep?: string;
}

export interface Task {
  id: string;
  name: string;
  dueAt: string;
  anchorPhrase?: string | null;
  status: TaskStatus;
  consequenceType: ConsequenceType;
  patternNote?: string;
  lastGuaranteedNudgeAt?: string | null;
  lastEscalationNudgeAt?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface TaskEntry {
  id: string;
  taskId: string;
  summary: string;
  nextPhysicalAction: string;
  conversation: Array<{ role: 'user' | 'assistant'; text: string; timestamp: string }>;
  createdAt: string;
}

export interface LogEntry {
  id: string;
  text: string;
  matchedTaskId: string | null;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  text: string;
  title?: string | null;
  link?: string | null;
  tags?: string[];
  createdAt: string;
}

export interface DailyStripItem {
  id?: string;
  type: 'task' | 'log';
  text: string;
  time?: string;
  timestamp?: string;
}

export interface DailyStrip {
  date: string;
  line: string;
  mood?: string | null;
  items?: DailyStripItem[];
}

export interface ThreadMessage {
  id: string;
  role: 'user' | 'system';
  text: string;
  relatedTaskId?: string | null;
  relatedLogEntryId?: string | null;
  messageType?: 'normal' | 'task-created' | 'auto-close' | 'candidate-prompt' | 'reopened' | 'checkin-prompt' | 'amnesty';
  createdAt: string;
}

export interface PartnerInvite {
  email: string;
  status: PartnerInviteStatus;
  partnerUid: string | null;
  ownerUid?: string;
  ownerName?: string;
  ownerEmail?: string;
  createdAt: string;
  approvedAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  revokedAt?: string;
  updatedAt?: string;
}

export interface PartnerStatusView {
  dailyStripLine: string | null;
  hasHardConsequenceInEscalationWindow: boolean;
  ownerName?: string;
  ownerUid?: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role?: 'owner' | 'partner';
  ownerUid?: string | null;
  anchorTimes?: AnchorTimes;
  notificationToken?: string;
  timezone?: string;
}

export type RelativeDaySignal =
  | 'today'
  | 'tomorrow'
  | 'in_N_days'
  | 'next_week'
  | 'next_monday'
  | 'next_tuesday'
  | 'next_wednesday'
  | 'next_thursday'
  | 'next_friday'
  | 'next_saturday'
  | 'next_sunday'
  | 'specific_date'
  | 'unspecified';

export type AnchorPhraseSignal =
  | 'before_work'
  | 'after_work'
  | 'before_sleep'
  | 'lunch'
  | 'none';

export interface TaskCreationSignals {
  name: string;
  relativeDay: RelativeDaySignal;
  relativeDayCount?: number | null;
  specificDate?: string | null;
  explicitTime?: string | null;
  anchorPhrase?: AnchorPhraseSignal | null;
  consequenceType: ConsequenceType;
  systemConfirmation?: string;
}

export interface PresenceState {
  isCheckingIn: boolean;
  updatedAt?: any;
}
