export interface UserRead {
  id: string;
  email: string;
  display_name: string;
  is_superadmin: boolean;
  created_at?: string | null;
  last_login_at?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token: string;
  token_type: string;
  user?: UserRead | null;
}

export interface OTPRequest {
  email: string;
  display_name?: string | null;
}

export interface OTPResponse {
  message: string;
  email: string;
  dev_otp?: string | null;
}

export interface OTPVerifyRequest {
  email: string;
  code: string;
}

export interface WorkspaceRead {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceCreate {
  name: string;
  description?: string | null;
}

export interface WorkspaceMemberRead {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  invited_by_user_id?: string | null;
  joined_at: string;
}

export interface UserWorkspaceMembership {
  workspace: WorkspaceRead;
  role: string;
}

export interface PersonSummary {
  id: string;
  first_name: string;
  last_name: string;
  maiden_name?: string | null;
  gender: string;
  is_living: boolean;
  birth_date?: string | null;
  birth_place?: string | null;
  death_date?: string | null;
  death_place?: string | null;
  avatar_url?: string | null;
  relationship_label?: string | null;
}

export interface FocusNeighborhoodResponse {
  focus_person: PersonSummary;
  parents: PersonSummary[];
  partners: PersonSummary[];
  children: PersonSummary[];
  siblings: PersonSummary[];
}

export interface PersonCreate {
  first_name: string;
  last_name: string;
  maiden_name?: string | null;
  gender?: string;
  is_living?: boolean;
  birth_date?: string | null;
  birth_date_qualifier?: string;
  birth_place?: string | null;
  death_date?: string | null;
  death_date_qualifier?: string;
  death_place?: string | null;
  biography?: string | null;
  avatar_url?: string | null;
}

export interface PersonUpdate {
  first_name?: string;
  last_name?: string;
  maiden_name?: string | null;
  gender?: string;
  is_living?: boolean;
  birth_date?: string | null;
  birth_date_qualifier?: string | null;
  birth_place?: string | null;
  death_date?: string | null;
  death_date_qualifier?: string | null;
  death_place?: string | null;
  biography?: string | null;
  avatar_url?: string | null;
}

export interface PersonRead {
  id: string;
  workspace_id: string;
  first_name: string;
  last_name: string;
  maiden_name?: string | null;
  gender: string;
  is_living: boolean;
  birth_date?: string | null;
  birth_date_qualifier: string;
  birth_place?: string | null;
  death_date?: string | null;
  death_date_qualifier: string;
  death_place?: string | null;
  biography?: string | null;
  avatar_url?: string | null;
  is_deleted: boolean;
  deleted_at?: string | null;
  deleted_by_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddRelativeRequest {
  relative_type: 'parent' | 'partner' | 'child' | 'sibling' | string;
  base_person_id: string;
  existing_person_id?: string;
  other_parent_id?: string;
  person?: PersonCreate;
  person_data?: PersonCreate;
}

export interface RemoveRelationshipRequest {
  base_person_id: string;
  target_person_id: string;
  relationship_type: 'partner' | 'parent' | 'child' | string;
}

export interface TreeEdge {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: 'partner' | 'parent_child' | string;
}

export interface TreeOverviewResponse {
  people: PersonSummary[];
  edges: TreeEdge[];
}

export interface LoreNoteCreate {
  person_id?: string | null;
  title: string;
  content: string;
  event_year?: number | null;
  tags?: string[];
}

export interface LoreNoteUpdate {
  title?: string;
  content?: string;
  event_year?: number | null;
  tags?: string[];
}

export interface LoreNoteRead {
  id: string;
  workspace_id: string;
  person_id: string;
  author_id: string;
  title: string;
  content: string;
  event_year?: number | null;
  tags: string[];
  is_deleted: boolean;
  deleted_at?: string | null;
  deleted_by_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrashItemRead {
  id: string;
  entity_type: string;
  name: string;
  deleted_at?: string | null;
  deleted_by_id?: string | null;
  days_remaining: number;
}

export interface TrashRestoreRequest {
  entity_type: string;
  entity_id: string;
}

export interface TrashPurgeResponse {
  purged_count: number;
  message: string;
}

export interface AuditLogRead {
  id: string;
  workspace_id: string;
  actor_id?: string | null;
  actor_name: string;
  actor_email: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: Record<string, unknown>;
  created_at: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  display_name: string;
}

export interface AdminWorkspaceItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  created_at: string;
  member_count: number;
  people_count: number;
  admins: AdminUserSummary[];
}

export interface AdminSystemStats {
  total_workspaces: number;
  total_users: number;
  total_people: number;
  total_lore_notes: number;
}

