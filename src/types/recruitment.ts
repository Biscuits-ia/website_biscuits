export type RecruitmentSessionStatus = 'open' | 'closed' | 'cancelled' | 'done';

export type RecruitmentSubmissionStatus = 'new' | 'reviewing' | 'accepted' | 'declined';

export interface RecruitmentSession {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  max_candidates: number;
  status: RecruitmentSessionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RecruitmentSessionWithStats extends RecruitmentSession {
  candidate_count: number;
  places_remaining: number;
}

export interface RecruitmentSubmission {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  skills: string | null;
  availability: string | null;
  motivation: string | null;
  status: RecruitmentSubmissionStatus;
  admin_notes: string | null;
  session_id: string | null;
  created_at: string;
}

export interface RecruitmentSubmissionWithSession extends RecruitmentSubmission {
  recruitment_sessions: RecruitmentSession | null;
}
