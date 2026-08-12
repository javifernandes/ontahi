export interface RateLimitPolicy {
  id?: string;
  limit: number;
  window: string;
}
