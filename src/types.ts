export type DeadlineStatus = 'pending' | 'met' | 'missed';
export type RiskLevel = 'low' | 'medium' | 'critical' | 'none';
export type LocationTag = 'home' | 'office' | 'in bed' | 'other';
export type PartnerInviteStatus = 'pending' | 'active' | 'revoked';

export interface Deadline {
  id: string;
  name: string;
  dueAt: string;
  createdAt: string;
  status: DeadlineStatus;
  latestRiskLevel: 'low' | 'medium' | 'critical' | null;
}

export interface CheckInMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface CheckInEntry {
  id: string;
  deadlineId: string;
  category: string;
  riskLevel: 'low' | 'medium' | 'critical';
  summary: string;
  actionItems: string[];
  locationTag: LocationTag;
  conversation: CheckInMessage[];
  createdAt: string;
  notified: boolean;
}

export interface UserStatus {
  streak: number;
  nextDeadlineName: string | null;
  nextDeadlineAt: string | null;
  currentRiskLevel: RiskLevel;
  updatedAt: string;
}

export interface PartnerInvite {
  email: string;
  status: PartnerInviteStatus;
  partnerUid: string | null;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role?: 'owner' | 'partner';
  ownerUid?: string | null;
}
