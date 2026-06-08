export interface AuthUser {
  email: string | null;
  anonymous: boolean;
}

export interface AuthContext {
  userId: string;
  groupId: string;
  email: string;
}

export interface AuthPort {
  authenticate(req: Request): Promise<AuthUser>;
}
