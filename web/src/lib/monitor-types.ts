export type MonitorSettings = {
  name: string;
  url: string;
  method: "GET" | "HEAD";
  expected_status: number;
  interval_seconds: number;
  timeout_ms: number;
  enabled: boolean;
};

export type Monitor = MonitorSettings & {
  id: string;
  created_at: string;
  updated_at: string;
  next_check_at: string;
};
