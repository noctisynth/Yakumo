export interface AccountSummary {
  id: string;
  school: string;
  schoolName: string;
  username: string;
  expiresAt: number;
  expired: boolean;
  avatarUrl?: string | null;
}

export interface AccountSnapshot {
  activeId: string | null;
  accounts: AccountSummary[];
}

export interface LoginInput {
  school: string;
  username: string;
  password: string;
  allowInsecureTransport: boolean;
}

export interface AccountError {
  code: string;
  message: string;
}
