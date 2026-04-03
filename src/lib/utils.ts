import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calcEstimatedEndDate(
  startDate: Date,
  estimatedHours: number,
  dailyCapacityHours: number,
): Date | null {
  if (estimatedHours <= 0 || dailyCapacityHours <= 0) return null
  const durationDays = Math.ceil(estimatedHours / dailyCapacityHours)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + durationDays - 1)
  return endDate
}
