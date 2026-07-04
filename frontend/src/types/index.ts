export interface Meeting {
  id: string;
  title: string;
  position_domain: string;
  round_name: string;
  recording_url?: string;
  attendance_status: string;
  attendance_duration: number;
  scheduled_time?: string;
  status: 'Scheduled' | 'Completed';
  transcript?: string;
  pdf_url?: string;
}

export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  type: 'user' | 'remote' | 'system';
}
