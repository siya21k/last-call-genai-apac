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

export interface DailyStrip {
  date: string;
  line: string;
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
  createdAt: string;
}

export interface PartnerStatusView {
  dailyStripLine: string | null;
  hasHardConsequenceInEscalationWindow: boolean;
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
}
