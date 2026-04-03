export type { Tenant, NewTenant, User, NewUser } from '@/lib/db/schema'

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}
